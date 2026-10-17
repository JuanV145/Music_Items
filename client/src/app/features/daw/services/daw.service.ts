import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import {
  AudioTrack,
  DawState,
  MAX_FADER_DB,
  MAX_SEMITONES,
  MIN_SEMITONES,
  PitchQuality,
  PlaybackNode,
  ProjectResponse,
  TrackChanges,
  TrackResponse,
  clamp,
  defaultTrackColor,
  isHexColor
} from '../models/daw.models';
import { PitchShifter } from './pitch-shifter';

const yieldToBrowser = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

export function configureMasterCompressor(context: BaseAudioContext): DynamicsCompressorNode {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -3;
  compressor.knee.value = 0;
  compressor.ratio.value = 20;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;
  return compressor;
}

@Injectable({ providedIn: 'root' })
export class DawService implements OnDestroy {
  private readonly state: DawState = {
    tracks: [],
    tempo: 120,
    timeSignature: '4/4',
    isPlaying: false,
    currentTime: 0,
    audioContext: null,
    masterGain: null,
    masterAnalyser: null,
    masterVolume: 0.8,
    playbackNodes: new Map<string, PlaybackNode>(),
    globalTranspose: 0,
    currentProjectId: undefined
  };

  private readonly apiUrl = 'http://localhost:8000/api';
  /** Ganancia lineal equivalente a +12 dB. */
  private readonly maxGain = Math.pow(10, MAX_FADER_DB / 20);
  private readonly meterBuffer = new Float32Array(512);
  /** Progreso (0..1) del render de pitch de cada pista que se está procesando. */
  private readonly trackProgress = new Map<string, number>();

  private playbackStartedAt = 0;
  private playbackStartPosition = 0;
  /** Posición a la que reanudar tras procesar pitch (null = no reanudar). */
  private resumePosition: number | null = null;

  // ── Cola de trabajos de pitch: se ejecutan de uno en uno, nunca se pisan. ──
  private pitchQueue: Promise<void> = Promise.resolve();
  private activeJobs = 0;
  /** Se incrementa para cancelar todos los trabajos en curso o encolados. */
  private generation = 0;
  private shifter: PitchShifter | null = null;

  transposeError = '';
  /** Progreso legible mostrado en el control de pitch. */
  transposeProgress = '';

  constructor(private readonly http: HttpClient) {
    this.initAudioContext();
  }

  /** true mientras haya algún trabajo de pitch (global o de pista) en curso o en cola. */
  get isTransposing(): boolean { return this.activeJobs > 0; }

  // ───────────────────────────── Motor de audio ─────────────────────────────

  private initAudioContext(): void {
    try {
      if (typeof window === 'undefined') return;
      const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const context = new Ctor();
      const masterGain = context.createGain();
      const masterCompressor = configureMasterCompressor(context);
      const masterAnalyser = context.createAnalyser();
      masterAnalyser.fftSize = 512;
      masterGain.gain.value = this.state.masterVolume;
      masterGain.connect(masterCompressor);
      masterCompressor.connect(masterAnalyser);
      masterAnalyser.connect(context.destination);
      this.state.audioContext = context;
      this.state.masterGain = masterGain;
      this.state.masterAnalyser = masterAnalyser;
    } catch (error) {
      console.error('Failed to initialize Web Audio:', error);
      this.state.audioContext = null;
      this.state.masterGain = null;
      this.state.masterAnalyser = null;
    }
  }

  private requireContext(): AudioContext {
    const context = this.state.audioContext;
    if (!context) throw new Error('El motor de audio no está disponible.');
    return context;
  }

  private getShifter(): PitchShifter {
    const context = this.requireContext();
    if (!this.shifter) this.shifter = new PitchShifter(context);
    return this.shifter;
  }

  getState(): DawState { return this.state; }
  getTrackProgress(trackId: string): number | undefined { return this.trackProgress.get(trackId); }
  getCurrentTime(): number { return this.state.isPlaying ? this.calculatePlaybackTime() : this.state.currentTime; }

  getProjectDuration(): number {
    return this.state.tracks.reduce((max, track) => track.audioBuffer
      ? Math.max(max, track.clipOffset + track.clipDuration)
      : max, 0);
  }

  // ───────────────────────────── Pistas ─────────────────────────────

  addTrack(name: string, audioBuffer: AudioBuffer, file: File | null = null): string {
    const id = this.createId();
    this.state.tracks.push({
      id,
      name,
      color: defaultTrackColor(name),
      file,
      audioBuffer,
      originalAudioBuffer: audioBuffer,
      volume: 1,
      pan: 0,
      muted: false,
      solo: false,
      waveform: this.computeWaveform(audioBuffer),
      clipOffset: 0,
      clipDuration: audioBuffer.duration,
      sourceOffset: 0,
      meterLevel: 0,
      pitchSemitones: 0
    });
    return id;
  }

  removeTrack(id: string): void {
    const node = this.state.playbackNodes.get(id);
    if (node) this.stopAndDisconnectNode(node);
    this.state.playbackNodes.delete(id);
    this.trackProgress.delete(id);
    this.state.tracks = this.state.tracks.filter(track => track.id !== id);
    this.refreshTrackGains();
  }

  updateTrack(id: string, changes: TrackChanges): void {
    const track = this.state.tracks.find(item => item.id === id);
    if (!track) return;

    const safe = { ...changes };
    if (safe.volume !== undefined) safe.volume = clamp(safe.volume, 0, this.maxGain);
    if (safe.pan !== undefined) safe.pan = clamp(safe.pan, -1, 1);
    if (safe.clipOffset !== undefined) safe.clipOffset = Math.max(0, safe.clipOffset);
    if (safe.clipDuration !== undefined) safe.clipDuration = Math.max(0, safe.clipDuration);
    if (safe.sourceOffset !== undefined) safe.sourceOffset = Math.max(0, safe.sourceOffset);
    Object.assign(track, safe);

    // Solo es un comportamiento de grupo: un cambio puede afectar a la ganancia de todos los canales.
    if (this.state.isPlaying) this.refreshTrackGains();
  }

  // ───────────────────────────── Pitch ─────────────────────────────

  /** Pitch global: pone TODAS las pistas en este valor (sobrescribe los ajustes manuales previos). */
  applyTranspose(semitones: number, quality: PitchQuality = 'High Quality'): Promise<void> {
    const target = clamp(Math.round(semitones), MIN_SEMITONES, MAX_SEMITONES);
    return this.enqueuePitchJob(async isCancelled => {
      const previous = this.state.globalTranspose;
      const pending = this.tracksPendingRender(target);
      this.transposeError = '';
      this.state.globalTranspose = target;
      if (pending.length === 0) {
        this.transposeProgress = '';
        return;
      }

      await this.withPlaybackPaused(async () => {
        const total = pending.length;
        try {
          for (let index = 0; index < total; index++) {
            if (isCancelled()) return;
            const track = pending[index];
            const label = `Pista ${index + 1}/${total}: ${track.name}`;
            this.transposeProgress = `Cargando fuente ${index + 1}/${total}: ${track.name}`;
            await yieldToBrowser();
            const done = await this.renderTrack(track, target, quality, isCancelled, fraction => {
              this.transposeProgress = `${label} · ${Math.round(fraction * 100)}%`;
            });
            if (!done) return;
          }
        } catch (error) {
          console.error('Could not apply pitch shift:', error);
          this.transposeError = error instanceof Error ? error.message : 'Error al procesar el audio';
          this.state.globalTranspose = previous;
        } finally {
          this.transposeProgress = '';
        }
      });
    });
  }

  /** Pone UNA pista en un pitch propio (valor absoluto en semitonos). Lanza error si falla. */
  applyTransposeToTrack(trackId: string, semitones: number, quality: PitchQuality = 'High Quality'): Promise<void> {
    const target = clamp(Math.round(semitones), MIN_SEMITONES, MAX_SEMITONES);
    return this.enqueuePitchJob(async isCancelled => {
      const track = this.state.tracks.find(item => item.id === trackId);
      if (!track) throw new Error(`No existe la pista ${trackId}.`);
      if (track.pitchSemitones === target) return;

      this.transposeError = '';
      await this.withPlaybackPaused(async () => {
        try {
          this.transposeProgress = `Procesando pista ${track.name}…`;
          await yieldToBrowser();
          await this.renderTrack(track, target, quality, isCancelled, fraction => {
            this.transposeProgress = `Pista ${track.name} · ${Math.round(fraction * 100)}%`;
          });
        } catch (error) {
          this.transposeError = error instanceof Error ? error.message : 'Error al procesar el audio';
          throw error;
        } finally {
          this.transposeProgress = '';
        }
      });
    });
  }

  resetTranspose(): void { void this.applyTranspose(0); }
  transposeUp(): void { void this.applyTranspose(this.state.globalTranspose + 1); }
  transposeDown(): void { void this.applyTranspose(this.state.globalTranspose - 1); }

  private tracksPendingRender(semitones: number): AudioTrack[] {
    return this.state.tracks.filter(track =>
      !!track.audioBuffer && this.hasRecoverableOriginal(track) && track.pitchSemitones !== semitones);
  }

  /** Renderiza una pista al pitch indicado y confirma el resultado de forma atómica. */
  private async renderTrack(
    track: AudioTrack,
    semitones: number,
    quality: PitchQuality,
    isCancelled: () => boolean,
    onProgress: (fraction: number) => void
  ): Promise<boolean> {
    this.trackProgress.set(track.id, 0);
    try {
      // Si el PCM original fue liberado, se recarga desde el File o desde el backend.
      const original = await this.getOriginalAudioBuffer(track);
      if (isCancelled()) return false;
      await yieldToBrowser();

      const shifted = semitones === 0
        ? original
        : await this.getShifter().shift(original, semitones, {
            mode: PitchShifter.detectMode(track.name),
            quality,
            isCancelled,
            onProgress: fraction => {
              this.trackProgress.set(track.id, fraction);
              onProgress(fraction);
            }
          });
      if (isCancelled()) return false;
      if (!shifted) throw new Error(`El procesamiento de pitch no generó audio para la pista "${track.name}".`);
      if (shifted.length !== original.length || shifted.numberOfChannels !== original.numberOfChannels) {
        throw new Error(`El audio procesado de "${track.name}" tiene una duración o canales inesperados.`);
      }

      track.audioBuffer = shifted;
      // Si el original se puede recuperar, se libera para ahorrar RAM; si no, se conserva para poder resetear.
      track.originalAudioBuffer = semitones === 0 || !this.canReloadOriginal(track) ? original : null;
      track.waveform = this.computeWaveform(shifted);
      track.clipDuration = Math.min(track.clipDuration, Math.max(0, shifted.duration - track.sourceOffset));
      track.pitchSemitones = semitones;
      return true;
    } finally {
      this.trackProgress.delete(track.id);
    }
  }

  private enqueuePitchJob(job: (isCancelled: () => boolean) => Promise<void>): Promise<void> {
    const generation = this.generation;
    const isCancelled = () => generation !== this.generation;
    this.activeJobs++;
    const run = this.pitchQueue.then(() => (isCancelled() ? undefined : job(isCancelled)));
    this.pitchQueue = run.then(() => undefined, () => undefined);
    return run.finally(() => { this.activeJobs--; });
  }

  /** Pausa la reproducción mientras dura la tarea y la reanuda en el mismo punto. */
  private async withPlaybackPaused(task: () => Promise<void>): Promise<void> {
    if (this.state.isPlaying) {
      const position = this.getCurrentTime();
      this.resumePosition = position;
      this.state.currentTime = position;
      this.state.isPlaying = false;
      this.clearPlaybackNodes();
    }
    try {
      await task();
    } finally {
      const resumeAt = this.resumePosition;
      this.resumePosition = null;
      if (resumeAt !== null) {
        try { await this.start(resumeAt); }
        catch (error) { console.error('No se pudo reanudar la reproducción tras cambiar el pitch:', error); }
      }
    }
  }

  private canReloadOriginal(track: AudioTrack): boolean { return !!track.file || !!track.audioFilePath; }
  private hasRecoverableOriginal(track: AudioTrack): boolean { return !!track.originalAudioBuffer || this.canReloadOriginal(track); }

  private async getOriginalAudioBuffer(track: AudioTrack): Promise<AudioBuffer> {
    if (track.originalAudioBuffer) return track.originalAudioBuffer;
    const context = this.requireContext();
    if (track.file) return context.decodeAudioData(await track.file.arrayBuffer());
    if (track.audioFilePath) return this.fetchAudioBuffer(track.audioFilePath, track.name);
    if (track.audioBuffer && track.pitchSemitones === 0) return track.audioBuffer;
    throw new Error(`No se puede recuperar el audio original de "${track.name}". Importa de nuevo el archivo para aplicar otro pitch.`);
  }

  private async fetchAudioBuffer(path: string, name: string): Promise<AudioBuffer> {
    const blob = await this.call(
      this.http.get(`${this.apiUrl}/audio/${path}`, { responseType: 'blob' }),
      `No se pudo recuperar el audio de la pista "${name}".`
    );
    return this.requireContext().decodeAudioData(await blob.arrayBuffer());
  }

  // ───────────────────────────── Transporte ─────────────────────────────

  async start(position = this.state.currentTime): Promise<void> {
    const context = this.state.audioContext;
    if (!context || this.state.tracks.length === 0 || this.state.isPlaying) return;
    if (context.state === 'suspended') await context.resume();

    const duration = this.getProjectDuration();
    if (duration <= 0) return;
    position = clamp(position, 0, duration);
    if (position >= duration) {
      this.state.currentTime = 0;
      position = 0;
    }

    if (!this.state.masterGain || !this.state.masterAnalyser) this.initAudioContext();
    if (!this.state.masterGain || !this.state.masterAnalyser || !this.state.audioContext) return;

    this.clearPlaybackNodes();
    this.state.masterGain.gain.setValueAtTime(this.state.masterVolume, context.currentTime);
    this.playbackStartPosition = position;
    this.playbackStartedAt = context.currentTime;
    this.state.currentTime = position;
    this.state.isPlaying = true;
    const anySolo = this.state.tracks.some(track => track.solo);

    for (const track of this.state.tracks) {
      const audioBuffer = track.audioBuffer;
      if (!audioBuffer || track.clipDuration <= 0) continue;
      const audible = !track.muted && (!anySolo || track.solo);
      const clipEnd = track.clipOffset + track.clipDuration;
      if (clipEnd <= position) continue;

      const elapsedInClip = Math.max(0, position - track.clipOffset);
      const when = context.currentTime + Math.max(0, track.clipOffset - position);
      const sourceStart = Math.max(0, (track.sourceOffset ?? 0) + elapsedInClip);
      const requestedDuration = Math.max(0, track.clipDuration - elapsedInClip);
      const sourceDuration = Math.min(requestedDuration, audioBuffer.duration - sourceStart);
      if (sourceDuration <= 0.001 || sourceStart >= audioBuffer.duration) continue;

      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      const gainNode = context.createGain();
      const panNode = context.createStereoPanner();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      gainNode.gain.setValueAtTime(audible ? track.volume : 0, context.currentTime);
      panNode.pan.setValueAtTime(track.pan, context.currentTime);
      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(analyser);
      analyser.connect(this.state.masterGain);
      this.state.playbackNodes.set(track.id, { source, gainNode, panNode, analyser });
      source.start(when, sourceStart, sourceDuration);
    }
  }

  pause(): void {
    this.resumePosition = null;
    if (!this.state.isPlaying) return;
    this.syncPlaybackClock();
    if (!this.state.isPlaying) return;
    this.state.isPlaying = false;
    this.clearPlaybackNodes();
  }

  stop(resetPosition = true): void {
    this.state.isPlaying = false;
    this.resumePosition = null;
    this.clearPlaybackNodes();
    if (resetPosition) this.state.currentTime = 0;
  }

  seek(position: number, resume = this.state.isPlaying): void {
    const nextPosition = clamp(Number.isFinite(position) ? position : 0, 0, this.getProjectDuration());
    this.stop(false);
    this.state.currentTime = nextPosition;
    this.playbackStartPosition = nextPosition;
    if (resume && this.state.tracks.length > 0) void this.start(nextPosition);
  }

  syncPlaybackClock(): void {
    if (!this.state.isPlaying || !this.state.audioContext) return;
    const current = this.calculatePlaybackTime();
    const duration = this.getProjectDuration();
    if (current >= duration) {
      this.stop(false);
      this.state.currentTime = duration;
      return;
    }
    this.state.currentTime = current;
  }

  private calculatePlaybackTime(): number {
    const context = this.state.audioContext;
    if (!context || !this.state.isPlaying) return this.state.currentTime;
    return Math.max(0, this.playbackStartPosition + (context.currentTime - this.playbackStartedAt));
  }

  setTempo(tempo: number): void { this.state.tempo = clamp(Math.round(tempo), 20, 300); }

  setMasterVolume(volume: number): void {
    this.state.masterVolume = clamp(volume, 0, this.maxGain);
    const context = this.state.audioContext;
    if (this.state.masterGain && context) {
      this.state.masterGain.gain.setTargetAtTime(this.state.masterVolume, context.currentTime, 0.012);
    }
  }

  private refreshTrackGains(): void {
    const context = this.state.audioContext;
    if (!context) return;
    const anySolo = this.state.tracks.some(track => track.solo);
    for (const track of this.state.tracks) {
      const node = this.state.playbackNodes.get(track.id);
      if (!node) continue;
      const audible = !track.muted && (!anySolo || track.solo);
      node.gainNode.gain.setTargetAtTime(audible ? track.volume : 0, context.currentTime, 0.012);
      node.panNode.pan.setTargetAtTime(track.pan, context.currentTime, 0.012);
    }
  }

  /** Actualiza los medidores RMS reales. Devuelve el nivel del Master. */
  refreshMeterLevels(): number {
    for (const track of this.state.tracks) {
      const playback = this.state.playbackNodes.get(track.id);
      track.meterLevel = playback ? this.measureRms(playback.analyser) : 0;
    }
    return this.state.masterAnalyser ? this.measureRms(this.state.masterAnalyser) : 0;
  }

  private measureRms(analyser: AnalyserNode): number {
    const data = this.meterBuffer.length >= analyser.fftSize ? this.meterBuffer : new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < analyser.fftSize; i++) sum += data[i] * data[i];
    return clamp(Math.sqrt(sum / Math.max(1, analyser.fftSize)) * 2.2, 0, 1);
  }

  private clearPlaybackNodes(): void {
    for (const node of this.state.playbackNodes.values()) this.stopAndDisconnectNode(node);
    this.state.playbackNodes.clear();
    for (const track of this.state.tracks) track.meterLevel = 0;
  }

  private stopAndDisconnectNode(node: PlaybackNode): void {
    node.source.onended = null;
    try { node.source.stop(); } catch { /* ya terminó */ }
    try { node.source.disconnect(); } catch { /* ya desconectado */ }
    try { node.gainNode.disconnect(); } catch { /* ya desconectado */ }
    try { node.panNode.disconnect(); } catch { /* ya desconectado */ }
    try { node.analyser.disconnect(); } catch { /* ya desconectado */ }
  }

  ngOnDestroy(): void {
    this.generation++;
    this.stop();
    if (this.state.audioContext) void this.state.audioContext.close();
  }

  computeWaveform(buffer: AudioBuffer): number[] {
    const bins = 400;
    const waveform = new Array<number>(bins).fill(0);
    if (!buffer.length || !buffer.numberOfChannels) return waveform;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    for (let bin = 0; bin < bins; bin++) {
      const start = Math.floor((bin / bins) * buffer.length);
      const end = Math.max(start + 1, Math.floor(((bin + 1) / bins) * buffer.length));
      let peak = 0;
      for (let i = start; i < Math.min(end, buffer.length); i++) {
        for (const channel of channels) peak = Math.max(peak, Math.abs(channel[i]));
      }
      waveform[bin] = peak;
    }
    return waveform;
  }

  // ───────────────────────────── Persistencia ─────────────────────────────

  async saveProject(projectName: string): Promise<number> {
    const projectData = {
      name: projectName,
      tempo: this.state.tempo,
      timeSignature: this.state.timeSignature,
      transpose: this.state.globalTranspose
    };

    let projectId = this.state.currentProjectId;
    if (projectId) {
      await this.call(this.http.put<ProjectResponse>(`${this.apiUrl}/daw/projects/${projectId}`, projectData), 'El backend no devolvió el proyecto al actualizar.');
    } else {
      const created = await this.call(this.http.post<ProjectResponse>(`${this.apiUrl}/daw/projects/`, projectData), 'El backend no devolvió el proyecto al crearlo.');
      projectId = created.id;
      this.state.currentProjectId = projectId;
    }

    for (const track of this.state.tracks) {
      const failure = `El backend no guardó la pista "${track.name}".`;
      if (track.serverId) {
        const body = track.file ? this.trackFormData(track) : this.trackJson(track);
        const response = await this.call(this.http.put<TrackResponse>(`${this.apiUrl}/daw/tracks/${track.serverId}`, body), failure);
        if (response.audio_file_path) track.audioFilePath = response.audio_file_path;
      } else {
        if (!track.file) throw new Error(`La pista "${track.name}" no tiene archivo de origen para subir.`);
        const response = await this.call(this.http.post<TrackResponse>(`${this.apiUrl}/daw/projects/${projectId}/tracks/`, this.trackFormData(track)), failure);
        track.serverId = response.id;
        if (response.audio_file_path) track.audioFilePath = response.audio_file_path;
      }
      // El backend ya guarda el audio: no se vuelve a subir en guardados posteriores.
      if (track.file && track.audioFilePath) track.file = null;
    }
    return projectId;
  }

  private trackJson(track: AudioTrack) {
    return {
      name: track.name,
      color: track.color,
      volume: track.volume,
      pan: track.pan,
      muted: track.muted,
      solo: track.solo,
      clipOffset: track.clipOffset,
      clipDuration: track.clipDuration
    };
  }

  private trackFormData(track: AudioTrack): FormData {
    if (!track.file) throw new Error(`La pista "${track.name}" no tiene archivo de audio para subir.`);
    const formData = new FormData();
    formData.append('audio_file', track.file);
    for (const [key, value] of Object.entries(this.trackJson(track))) formData.append(key, String(value));
    return formData;
  }

  async loadProject(projectId: number): Promise<void> {
    const project = await this.call(this.http.get<ProjectResponse>(`${this.apiUrl}/daw/projects/${projectId}`), 'El backend no devolvió el proyecto.');
    this.requireContext();

    // Se descargan y decodifican todas las pistas ANTES de tocar el estado actual.
    const loaded: AudioTrack[] = [];
    for (const dto of project.tracks ?? []) {
      const audioBuffer = await this.fetchAudioBuffer(dto.audio_file_path, dto.name);
      loaded.push({
        id: this.createId(),
        serverId: dto.id,
        name: dto.name,
        color: isHexColor(dto.color) ? dto.color : defaultTrackColor(dto.name),
        file: null,
        audioFilePath: dto.audio_file_path,
        audioBuffer,
        originalAudioBuffer: audioBuffer,
        volume: clamp(dto.volume ?? 1, 0, this.maxGain),
        pan: clamp(dto.pan ?? 0, -1, 1),
        muted: !!dto.muted,
        solo: !!dto.solo,
        waveform: this.computeWaveform(audioBuffer),
        clipOffset: Math.max(0, dto.clip_offset ?? 0),
        clipDuration: Math.max(0, Math.min(dto.clip_duration ?? audioBuffer.duration, audioBuffer.duration)),
        sourceOffset: 0,
        meterLevel: 0,
        pitchSemitones: 0
      });
    }

    this.generation++; // cancela cualquier proceso de pitch pendiente del proyecto anterior
    this.stop();
    this.state.currentProjectId = projectId;
    this.state.tempo = project.tempo ?? 120;
    this.state.timeSignature = project.timeSignature ?? '4/4';
    this.state.tracks = loaded;
    this.state.globalTranspose = 0;

    const requested = clamp(project.transpose ?? 0, MIN_SEMITONES, MAX_SEMITONES);
    if (requested !== 0) await this.applyTranspose(requested);
  }

  async getProjects(): Promise<ProjectResponse[]> {
    return this.call(this.http.get<ProjectResponse[]>(`${this.apiUrl}/daw/projects/`), 'El backend no devolvió la lista de proyectos.');
  }

  async deleteProject(projectId: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/daw/projects/${projectId}`));
    if (this.state.currentProjectId === projectId) this.state.currentProjectId = undefined;
  }

  async updateProjectName(projectId: number, name: string): Promise<void> {
    await this.call(this.http.put(`${this.apiUrl}/daw/projects/${projectId}`, { name }), 'No se pudo actualizar el nombre del proyecto.');
  }

  // ───────────────────────────── Exportación ─────────────────────────────

  async exportMix(): Promise<Blob> {
    const context = this.state.audioContext;
    if (!context || !this.state.tracks.some(track => !!track.audioBuffer)) {
      throw new Error('No hay pistas de audio para exportar o el motor de audio no está disponible.');
    }
    const duration = this.getProjectDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('La sesión no tiene duración exportable.');
    const sampleRate = context.sampleRate;
    const frameCount = Math.max(1, Math.ceil(sampleRate * duration));
    const Offline = window.OfflineAudioContext || (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Offline) throw new Error('Este navegador no soporta exportación de audio offline.');

    const offline = new Offline(2, frameCount, sampleRate);
    const masterGain = offline.createGain();
    const masterCompressor = configureMasterCompressor(offline);
    masterGain.gain.setValueAtTime(this.state.masterVolume, 0);
    masterGain.connect(masterCompressor);
    masterCompressor.connect(offline.destination);
    const anySolo = this.state.tracks.some(track => track.solo);

    for (const track of this.state.tracks) {
      const audioBuffer = track.audioBuffer;
      if (!audioBuffer || track.clipDuration <= 0) continue;
      if (track.muted || (anySolo && !track.solo)) continue;
      const sourceOffset = Math.max(0, track.sourceOffset ?? 0);
      const clipLength = Math.min(track.clipDuration, audioBuffer.duration - sourceOffset);
      if (clipLength <= 0 || sourceOffset >= audioBuffer.duration) continue;
      const source = offline.createBufferSource();
      source.buffer = audioBuffer;
      const gainNode = offline.createGain();
      const panNode = offline.createStereoPanner();
      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(masterGain);
      gainNode.gain.setValueAtTime(track.volume, 0);
      panNode.pan.setValueAtTime(track.pan, 0);
      source.start(track.clipOffset, sourceOffset, clipLength);
    }
    return this.audioBufferToWav(await offline.startRendering());
  }

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitsPerSample = 16;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = buffer.length * blockAlign;
    const wav = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wav);
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    const channels = Array.from({ length: numChannels }, (_, channel) => buffer.getChannelData(channel));
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = clamp(channels[channel][i], -1, 1);
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([wav], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, value: string): void {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  }

  // ───────────────────────────── Utilidades ─────────────────────────────

  /** Convierte un Observable HTTP en promesa y falla con un mensaje claro si no hay respuesta. */
  private async call<T>(request$: Observable<T>, failure: string): Promise<T> {
    const response = await firstValueFrom(request$);
    if (response === null || response === undefined) throw new Error(failure);
    return response;
  }

  private createId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
  }
}