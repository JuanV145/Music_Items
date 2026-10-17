import {
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Inject,
  NgZone,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DawService } from './services/daw.service';
import {
  AudioTrack,
  ClipInteraction,
  MAX_FADER_DB,
  MAX_SEMITONES,
  MIN_FADER_DB,
  MIN_SEMITONES,
  PitchQuality,
  clamp,
  defaultTrackColor,
  isHexColor
} from './models/daw.models';

interface TimeMark { time: number; label: string; }
interface GridLine { time: number; }

@Component({
  selector: 'app-daw',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './daw.component.html',
  styleUrls: ['./daw.component.scss']
})
export class DawComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
  readonly Math = Math;
  readonly RULER_HEIGHT = 58;
  readonly TRACK_HEIGHT = 66;
  readonly MIN_SEMITONES = MIN_SEMITONES;
  readonly MAX_SEMITONES = MAX_SEMITONES;

  get state() { return this.dawService.getState(); }
  get transpose(): number { return this.state.globalTranspose; }
  get pitchProcessing(): boolean { return this.dawService.isTransposing; }
  get pitchProgress(): string { return this.dawService.transposeProgress; }
  get pitchError(): string { return this.dawService.transposeError; }

  // Línea de tiempo
  timelineWidth = 80;
  zoomLevel = 1;
  scrollOffset = 0;
  playheadPosition = 0;
  currentTime = 0;

  // Mezclador
  masterVolume = 0.8;
  masterMeterLevel = 0;
  mixerCollapsed = false;
  pitchDraft: number | null = null;
  private readonly qualityDraft: PitchQuality = 'High Quality';

  selectedClip: { trackId: string } | null = null;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('timelineViewport') timelineViewport!: ElementRef<HTMLDivElement>;
  @ViewChild('trackList') trackList!: ElementRef<HTMLDivElement>;

  // Borradores de entrada (no confirmados todavía)
  private readonly trackPitchDraft = new Map<string, number>();
  private readonly trackPitchProcessing = new Set<string>();
  private readonly trackVolumeDbDraft: Record<string, string> = {};
  private masterVolumeDbDraft: string | null = null;

  private animationFrameId: number | null = null;
  private destroyed = false;
  private syncingScroll = false;
  private marksCache: { key: string; value: TimeMark[] } | null = null;
  private gridCache: { key: string; value: GridLine[] } | null = null;
  private readonly waveformReferences = new WeakMap<HTMLCanvasElement, number[] | null>();
  private readonly waveformKeys = new WeakMap<HTMLCanvasElement, string>();

  private clipInteraction: ClipInteraction | null = null;
  private interactingTrackId: string | null = null;
  private interactionStartX = 0;
  private interactionStartClipOffset = 0;
  private interactionStartDuration = 0;
  private interactionStartSourceOffset = 0;
  private wasPlayingBeforeEdit = false;
  private panDragTrackId: string | null = null;
  private panStartY = 0;
  private panStartValue = 0;

  private readonly boundMouseMove = (event: MouseEvent) => this.onDocumentMouseMove(event);
  private readonly boundMouseUp = () => this.onDocumentMouseUp();

  constructor(
    private readonly dawService: DawService,
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone
  ) {
    this.masterVolume = this.state.masterVolume ?? 0.8;
    this.dawService.setMasterVolume(this.masterVolume);
  }

  // ───────────────────────────── Ciclo de vida ─────────────────────────────

  ngAfterViewInit(): void {
    this.animatePlayhead();
    this.cdr.detectChanges();
  }

  ngAfterViewChecked(): void {
    this.drawTimelineWaveforms();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    this.removeClipListeners();
  }

  /** Bucle de animación fuera de la zona de Angular; solo redibuja cuando algo cambia. */
  private animatePlayhead(): void {
    this.ngZone.runOutsideAngular(() => {
      const frame = () => {
        if (this.destroyed) return;
        // Se reprograma ANTES de actualizar: si algo lanza una excepción, el bucle sigue vivo.
        this.animationFrameId = requestAnimationFrame(frame);
        try {
          this.dawService.syncPlaybackClock();
          const time = this.dawService.getCurrentTime();
          const meter = this.dawService.refreshMeterLevels();
          const changed = this.state.isPlaying || time !== this.currentTime || meter !== this.masterMeterLevel;
          this.currentTime = time;
          this.playheadPosition = time;
          this.masterMeterLevel = meter;
          if (changed) this.cdr.detectChanges();
        } catch (error) {
          console.error('Error en el bucle del playhead:', error);
        }
      };
      this.animationFrameId = requestAnimationFrame(frame);
    });
  }

  // ───────────────────────────── trackBy ─────────────────────────────

  readonly trackById = (_: number, track: AudioTrack): string => track.id;
  readonly trackByTime = (_: number, item: { time: number }): number => item.time;

  // ───────────────────────────── Importación ─────────────────────────────

  openImport(): void { this.fileInput?.nativeElement.click(); }
  addTrack(): void { this.openImport(); }

  async onFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    // En secuencia para conservar el orden de selección.
    for (const file of files) await this.loadAudioFile(file);
  }

  private async loadAudioFile(file: File): Promise<void> {
    if (!/\.(wav|mp3)$/i.test(file.name) && !file.type.startsWith('audio/')) {
      this.alert(`Formato no compatible: ${file.name}. Importa archivos WAV o MP3.`);
      return;
    }
    const audioContext = this.state.audioContext;
    if (!audioContext) {
      this.alert('El motor de audio no está disponible en este navegador.');
      return;
    }
    try {
      const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
      const trackId = this.dawService.addTrack(file.name.replace(/\.(wav|mp3)$/i, ''), audioBuffer, file);
      // Si hay un pitch global activo, solo la pista nueva se pone en ese valor (no toca las demás).
      if (this.transpose !== 0) {
        this.dawService.applyTransposeToTrack(trackId, this.transpose, this.qualityDraft)
          .catch(error => this.alert(`No se pudo aplicar el pitch a "${file.name}": ${this.errorMessage(error)}`));
      }
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error importing audio:', error);
      this.alert(`No se pudo importar ${file.name}: ${this.errorMessage(error)}`);
    }
  }

  // ───────────────────────────── Forma de onda ─────────────────────────────

  private drawTimelineWaveforms(): void {
    if (!this.timelineViewport) return;
    const canvases = this.timelineViewport.nativeElement.querySelectorAll<HTMLCanvasElement>('.waveform-canvas');
    canvases.forEach(canvas => {
      const trackId = canvas.dataset['trackId'];
      if (!trackId) return;
      const track = this.state.tracks.find(item => item.id === trackId);
      if (!track?.waveform) return;
      const key = `${track.clipOffset}:${track.clipDuration}:${track.sourceOffset ?? 0}:${canvas.width}:${canvas.height}`;
      if (this.waveformReferences.get(canvas) === track.waveform && this.waveformKeys.get(canvas) === key) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const centerY = canvas.height / 2;
      const amplitude = Math.max(1, canvas.height * 0.43);
      const points = track.waveform;
      const sourceDuration = track.audioBuffer?.duration ?? track.clipDuration;
      const sourceOffset = track.sourceOffset ?? 0;
      const startPoint = Math.min(points.length - 1, Math.floor((sourceOffset / Math.max(0.001, sourceDuration)) * points.length));
      const endPoint = Math.min(points.length, Math.max(startPoint + 1, Math.ceil(((sourceOffset + track.clipDuration) / Math.max(0.001, sourceDuration)) * points.length)));
      const samplesPerPixel = (endPoint - startPoint) / Math.max(1, canvas.width);
      context.strokeStyle = 'rgba(234, 255, 244, 0.93)';
      context.lineWidth = 1;
      context.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const start = startPoint + Math.floor(x * samplesPerPixel);
        const end = Math.max(start + 1, startPoint + Math.floor((x + 1) * samplesPerPixel));
        let peak = 0;
        for (let i = start; i < Math.min(end, endPoint); i++) peak = Math.max(peak, points[i] || 0);
        const y = peak * amplitude;
        context.moveTo(x + 0.5, centerY - y);
        context.lineTo(x + 0.5, centerY + y);
      }
      context.stroke();
      context.strokeStyle = 'rgba(12, 34, 28, 0.6)';
      context.beginPath();
      context.moveTo(0, centerY + 0.5);
      context.lineTo(canvas.width, centerY + 0.5);
      context.stroke();
      this.waveformReferences.set(canvas, track.waveform);
      this.waveformKeys.set(canvas, key);
    });
  }

  getCanvasWidth(track: AudioTrack): number {
    return Math.max(16, Math.min(8192, Math.ceil(this.timeToPixels(track.clipDuration))));
  }

  // ───────────────────────────── Línea de tiempo ─────────────────────────────

  getTimelineWidth(): number {
    const duration = Math.max(this.getProjectDuration(), this.getVisibleDuration(), 30);
    const viewportWidth = this.timelineViewport?.nativeElement.clientWidth ?? 700;
    return Math.max(viewportWidth, 500, this.timeToPixels(duration + 2));
  }

  getTimelineContentHeight(): number {
    return this.RULER_HEIGHT + Math.max(1, this.state.tracks.length) * this.TRACK_HEIGHT;
  }

  getVisibleDuration(): number {
    const width = this.timelineViewport?.nativeElement.clientWidth ?? 700;
    return width / this.pixelsPerSecond();
  }

  pixelsPerSecond(): number { return this.timelineWidth * this.zoomLevel; }
  timeToPixels(time: number): number { return Math.max(0, time) * this.pixelsPerSecond(); }
  getProjectDuration(): number { return this.dawService.getProjectDuration(); }

  private pickInterval(intervals: number[], desiredPixels: number, fallback: number): number {
    const px = this.pixelsPerSecond();
    return intervals.find(interval => interval * px >= desiredPixels) ?? fallback;
  }

  private timeMarkInterval(): number {
    return this.pickInterval([0.125, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200], 72, 14400);
  }

  private timeGridInterval(): number {
    return this.pickInterval([0.0625, 0.125, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200], 30, 14400);
  }

  private formatRulerTime(seconds: number, interval: number): string {
    if (interval >= 1) return this.formatTime(seconds);
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const whole = Math.floor(safe + 1e-8);
    const milliseconds = Math.round((safe - whole) * 1000);
    if (milliseconds <= 0) return this.formatTime(whole);
    return `${this.formatTime(whole)}.${String(milliseconds).padStart(3, '0').replace(/0+$/, '')}`;
  }

  /** Rango visible de la regla/cuadrícula; se usa también como clave de caché. */
  private visibleRange(interval: number): { first: number; last: number } {
    const duration = Math.max(this.getProjectDuration(), this.getVisibleDuration(), 30);
    const first = Math.floor((this.scrollOffset + 1e-9) / interval) * interval;
    const last = Math.min(duration + interval, this.scrollOffset + this.getVisibleDuration() + interval * 2);
    return { first, last };
  }

  getTimeMarks(): TimeMark[] {
    const interval = this.timeMarkInterval();
    const { first, last } = this.visibleRange(interval);
    const key = `${interval}|${first}|${last}`;
    if (this.marksCache?.key === key) return this.marksCache.value;
    const marks: TimeMark[] = [];
    for (let time = first; time <= last && marks.length < 1200; time += interval) {
      const normalized = Number(time.toFixed(4));
      marks.push({ time: normalized, label: this.formatRulerTime(normalized, interval) });
    }
    this.marksCache = { key, value: marks };
    return marks;
  }

  getGridLines(): GridLine[] {
    const interval = this.timeGridInterval();
    const { first, last } = this.visibleRange(interval);
    const key = `${interval}|${first}|${last}`;
    if (this.gridCache?.key === key) return this.gridCache.value;
    const lines: GridLine[] = [];
    for (let time = first; time <= last && lines.length < 2400; time += interval) {
      lines.push({ time: Number(time.toFixed(4)) });
    }
    this.gridCache = { key, value: lines };
    return lines;
  }

  formatTime(seconds: number): string {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const total = Math.floor(safe);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
  }

  formatSemitones(value: number): string { return `${value > 0 ? '+' : ''}${value} st`; }

  onTimelineClick(event: MouseEvent): void {
    if (!this.timelineViewport) return;
    if ((event.target as HTMLElement | null)?.closest('.audio-clip')) return;
    const viewport = this.timelineViewport.nativeElement;
    const rect = viewport.getBoundingClientRect();
    const time = Math.max(0, (event.clientX - rect.left + viewport.scrollLeft) / this.pixelsPerSecond());
    this.selectedClip = null;
    this.dawService.seek(time);
    this.currentTime = this.dawService.getCurrentTime();
    this.playheadPosition = this.currentTime;
    this.cdr.detectChanges();
  }

  onTimelineScroll(): void {
    if (!this.timelineViewport || this.syncingScroll) return;
    this.syncingScroll = true;
    this.scrollOffset = this.timelineViewport.nativeElement.scrollLeft / this.pixelsPerSecond();
    if (this.trackList) this.trackList.nativeElement.scrollTop = this.timelineViewport.nativeElement.scrollTop;
    this.syncingScroll = false;
  }

  onTrackListScroll(): void {
    if (!this.trackList || !this.timelineViewport || this.syncingScroll) return;
    this.syncingScroll = true;
    this.timelineViewport.nativeElement.scrollTop = this.trackList.nativeElement.scrollTop;
    this.syncingScroll = false;
  }

  scrollToPlayhead(): void {
    if (!this.timelineViewport) return;
    const viewport = this.timelineViewport.nativeElement;
    const cursorX = this.timeToPixels(this.playheadPosition);
    if (cursorX < viewport.scrollLeft || cursorX > viewport.scrollLeft + viewport.clientWidth - 40) {
      viewport.scrollLeft = Math.max(0, cursorX - viewport.clientWidth * 0.2);
      this.onTimelineScroll();
    }
  }

  zoomIn(): void { this.setZoom(this.zoomLevel * 1.25); }
  zoomOut(): void { this.setZoom(this.zoomLevel / 1.4); }

  private setZoom(value: number): void {
    const viewport = this.timelineViewport?.nativeElement;
    const anchorTime = viewport ? (viewport.scrollLeft + viewport.clientWidth / 2) / this.pixelsPerSecond() : 0;
    this.zoomLevel = clamp(value, 0.02, 8);
    this.cdr.detectChanges();
    if (viewport) {
      viewport.scrollLeft = Math.max(0, this.timeToPixels(anchorTime) - viewport.clientWidth / 2);
      this.onTimelineScroll();
    }
  }

  // ───────────────────────────── Pistas y clips ─────────────────────────────

  getTrackColor(track: AudioTrack): string {
    return isHexColor(track.color) ? track.color : defaultTrackColor(track.name);
  }

  onTrackColorChange(trackId: string, color: string): void {
    if (isHexColor(color)) this.dawService.updateTrack(trackId, { color });
  }

  onTrackNameChange(trackId: string, value: string): void {
    this.dawService.updateTrack(trackId, { name: value });
  }

  toggleMute(trackId: string): void {
    const track = this.state.tracks.find(item => item.id === trackId);
    if (track) this.dawService.updateTrack(trackId, { muted: !track.muted });
  }

  toggleSolo(trackId: string): void {
    const track = this.state.tracks.find(item => item.id === trackId);
    if (track) this.dawService.updateTrack(trackId, { solo: !track.solo });
  }

  removeTrack(trackId: string): void {
    if (!this.win.confirm('¿Eliminar esta pista de la sesión?')) return;
    this.dawService.removeTrack(trackId);
    this.trackPitchDraft.delete(trackId);
    delete this.trackVolumeDbDraft[trackId];
    if (this.selectedClip?.trackId === trackId) this.selectedClip = null;
    this.cdr.detectChanges();
  }

  onClipMouseDown(event: MouseEvent, track: AudioTrack): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.clip-edge')) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectedClip = { trackId: track.id };
    this.beginClipInteraction(event, track, 'move');
  }

  onResizeHandleMouseDown(event: MouseEvent, track: AudioTrack, direction: 'left' | 'right'): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedClip = { trackId: track.id };
    this.beginClipInteraction(event, track, direction === 'left' ? 'resize-left' : 'resize-right');
  }

  private beginClipInteraction(event: MouseEvent, track: AudioTrack, mode: ClipInteraction): void {
    this.clipInteraction = mode;
    this.interactingTrackId = track.id;
    this.interactionStartX = event.clientX;
    this.interactionStartClipOffset = track.clipOffset;
    this.interactionStartDuration = track.clipDuration;
    this.interactionStartSourceOffset = track.sourceOffset ?? 0;
    this.wasPlayingBeforeEdit = this.state.isPlaying;
    this.document.addEventListener('mousemove', this.boundMouseMove);
    this.document.addEventListener('mouseup', this.boundMouseUp);
  }

  private onDocumentMouseMove(event: MouseEvent): void {
    if (!this.clipInteraction || !this.interactingTrackId) return;
    const track = this.state.tracks.find(item => item.id === this.interactingTrackId);
    if (!track?.audioBuffer) return;
    const sourceLength = track.audioBuffer.duration;
    const delta = (event.clientX - this.interactionStartX) / this.pixelsPerSecond();

    if (this.clipInteraction === 'move') {
      this.dawService.updateTrack(track.id, { clipOffset: Math.max(0, this.interactionStartClipOffset + delta) });
    } else if (this.clipInteraction === 'resize-right') {
      const maxDuration = Math.max(0.05, sourceLength - (track.sourceOffset ?? 0));
      this.dawService.updateTrack(track.id, { clipDuration: clamp(this.interactionStartDuration + delta, 0.05, maxDuration) });
    } else {
      const end = this.interactionStartClipOffset + this.interactionStartDuration;
      const start = Math.max(0, Math.min(end - 0.05, this.interactionStartClipOffset + delta));
      const sourceOffset = clamp(this.interactionStartSourceOffset + (start - this.interactionStartClipOffset), 0, sourceLength - 0.05);
      const duration = Math.max(0.05, Math.min(sourceLength - sourceOffset, end - start));
      this.dawService.updateTrack(track.id, { clipOffset: start, sourceOffset, clipDuration: duration });
    }
    this.cdr.detectChanges();
  }

  private onDocumentMouseUp(): void {
    const shouldResume = this.wasPlayingBeforeEdit;
    const current = this.dawService.getCurrentTime();
    this.clipInteraction = null;
    this.interactingTrackId = null;
    this.removeClipListeners();
    if (shouldResume) this.dawService.seek(current, true);
  }

  private removeClipListeners(): void {
    this.document.removeEventListener('mousemove', this.boundMouseMove);
    this.document.removeEventListener('mouseup', this.boundMouseUp);
  }

  onClipDoubleClick(track: AudioTrack): void {
    if (!track.audioBuffer) return;
    this.dawService.updateTrack(track.id, { clipOffset: 0, sourceOffset: 0, clipDuration: track.audioBuffer.duration });
    this.selectedClip = { trackId: track.id };
    this.cdr.detectChanges();
  }

  // ───────────────────────────── Volumen ─────────────────────────────

  /** Mapea ganancia lineal al recorrido del fader (-60..+12 dB). */
  faderDbValue(volume: number): number {
    return volume <= 0.001 ? MIN_FADER_DB : clamp(20 * Math.log10(volume), MIN_FADER_DB, MAX_FADER_DB);
  }

  private volumeFromFaderDb(decibels: number): number {
    return decibels <= MIN_FADER_DB ? 0 : clamp(Math.pow(10, decibels / 20), 0, Math.pow(10, MAX_FADER_DB / 20));
  }

  /**
   * Curva del fader (posición 0..1 de abajo hacia arriba -> dB). Reparte el recorrido como una
   * consola real: la zona útil (-12..+12 dB) ocupa la mitad superior y el 0 dB queda al 75 %.
   */
  private readonly FADER_TAPER: ReadonlyArray<readonly [db: number, position: number]> = [
    [MIN_FADER_DB, 0],
    [-36, 0.15],
    [-24, 0.30],
    [-12, 0.50],
    [0, 0.75],
    [MAX_FADER_DB, 1]
  ];
  /** Resolución del <input type="range"> del fader. */
  readonly FADER_STEPS = 1000;
  /** Imán al 0 dB: dentro de este margen el fader se queda exactamente en ganancia unidad. */
  private readonly UNITY_SNAP_DB = 0.4;

  /** Posición del fader (0..FADER_STEPS) para una ganancia lineal. */
  faderPosition(volume: number): number {
    const db = this.faderDbValue(volume);
    const taper = this.FADER_TAPER;
    for (let i = 1; i < taper.length; i++) {
      const [d0, p0] = taper[i - 1];
      const [d1, p1] = taper[i];
      if (db <= d1) return Math.round((p0 + ((db - d0) / (d1 - d0)) * (p1 - p0)) * this.FADER_STEPS);
    }
    return this.FADER_STEPS;
  }

  /** Ganancia lineal para una posición del fader (0..FADER_STEPS). */
  private volumeFromFaderPosition(rawPosition: number): number {
    const position = clamp(rawPosition / this.FADER_STEPS, 0, 1);
    const taper = this.FADER_TAPER;
    let db = MAX_FADER_DB;
    for (let i = 1; i < taper.length; i++) {
      const [d0, p0] = taper[i - 1];
      const [d1, p1] = taper[i];
      if (position <= p1) {
        db = d0 + ((position - p0) / (p1 - p0)) * (d1 - d0);
        break;
      }
    }
    if (Math.abs(db) < this.UNITY_SNAP_DB) db = 0;
    return this.volumeFromFaderDb(db);
  }

  onTrackVolumeInput(trackId: string, event: Event): void {
    const position = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(position)) return;
    delete this.trackVolumeDbDraft[trackId];
    this.dawService.updateTrack(trackId, { volume: this.volumeFromFaderPosition(position) });
  }

  onMasterVolumeInput(event: Event): void {
    const position = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(position)) return;
    this.masterVolumeDbDraft = null;
    this.masterVolume = this.volumeFromFaderPosition(position);
    this.dawService.setMasterVolume(this.masterVolume);
  }

  resetTrackVolume(trackId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    delete this.trackVolumeDbDraft[trackId];
    this.dawService.updateTrack(trackId, { volume: 1 }); // 0.0 dB = ganancia unidad
  }

  resetMasterVolume(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.masterVolumeDbDraft = null;
    this.masterVolume = 1;
    this.dawService.setMasterVolume(1);
  }

  trackVolumeDbText(track: AudioTrack): string {
    return this.trackVolumeDbDraft[track.id] ?? this.faderDbValue(track.volume).toFixed(1);
  }

  setTrackVolumeDbDraft(trackId: string, value: string | number | null): void {
    this.trackVolumeDbDraft[trackId] = value === null || value === undefined ? '' : String(value);
  }

  commitTrackVolumeDb(trackId: string): void {
    const raw = this.trackVolumeDbDraft[trackId];
    if (raw === undefined) return;
    delete this.trackVolumeDbDraft[trackId];
    const decibels = Number(raw.trim());
    if (!raw.trim() || !Number.isFinite(decibels)) return;
    this.dawService.updateTrack(trackId, { volume: this.volumeFromFaderDb(clamp(decibels, MIN_FADER_DB, MAX_FADER_DB)) });
  }

  masterVolumeDbText(): string {
    return this.masterVolumeDbDraft ?? this.faderDbValue(this.masterVolume).toFixed(1);
  }

  setMasterVolumeDbDraft(value: string | number | null): void {
    this.masterVolumeDbDraft = value === null || value === undefined ? '' : String(value);
  }

  commitMasterVolumeDb(): void {
    if (this.masterVolumeDbDraft === null) return;
    const raw = this.masterVolumeDbDraft.trim();
    this.masterVolumeDbDraft = null;
    const decibels = Number(raw);
    if (!raw || !Number.isFinite(decibels)) return;
    this.masterVolume = this.volumeFromFaderDb(clamp(decibels, MIN_FADER_DB, MAX_FADER_DB));
    this.dawService.setMasterVolume(this.masterVolume);
  }

  // ───────────────────────────── Paneo ─────────────────────────────

  /** Píxeles de arrastre vertical para recorrer todo el paneo (de -100 a +100). */
  private readonly PAN_DRAG_PIXELS = 90;
  /** Imán al centro: por debajo de este valor el paneo queda exactamente en C. */
  private readonly PAN_CENTER_SNAP = 0.03;

  /**
   * Arrastre del knob con captura de puntero: los eventos siguientes llegan al propio knob
   * aunque el ratón salga de él, y como son eventos de la plantilla Angular siempre repinta.
   */
  onPanPointerDown(event: PointerEvent, trackId: string): void {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.panDragTrackId = trackId;
    this.panStartY = event.clientY;
    this.panStartValue = this.state.tracks.find(track => track.id === trackId)?.pan ?? 0;
  }

  onPanPointerMove(event: PointerEvent, trackId: string): void {
    if (this.panDragTrackId !== trackId) return;
    // Arriba = derecha, abajo = izquierda.
    const pan = clamp(this.panStartValue + (this.panStartY - event.clientY) / this.PAN_DRAG_PIXELS, -1, 1);
    this.dawService.updateTrack(trackId, { pan: Math.abs(pan) < this.PAN_CENTER_SNAP ? 0 : pan });
  }

  onPanPointerUp(event: PointerEvent): void {
    const knob = event.currentTarget as HTMLElement;
    if (knob.hasPointerCapture?.(event.pointerId)) knob.releasePointerCapture(event.pointerId);
    this.panDragTrackId = null;
  }

  centerPan(trackId: string): void { this.dawService.updateTrack(trackId, { pan: 0 }); }

  onPanKeydown(event: KeyboardEvent, trackId: string): void {
    const track = this.state.tracks.find(item => item.id === trackId);
    if (!track) return;
    let next = track.pan;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= 0.05;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next += 0.05;
    else if (event.key === 'Home') next = 0;
    else return;
    event.preventDefault();
    this.dawService.updateTrack(trackId, { pan: clamp(next, -1, 1) });
  }

  panLabel(pan: number): string {
    if (Math.abs(pan) < 0.005) return 'C';
    return `${pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(pan) * 100)}`;
  }

  // ───────────────────────────── Pitch ─────────────────────────────

  async applyPitch(): Promise<void> {
    if (this.pitchProcessing) return;
    const raw = this.pitchDraft === null ? this.transpose : Number(this.pitchDraft);
    if (!Number.isFinite(raw)) {
      this.pitchDraft = null;
      return;
    }
    const semitones = clamp(Math.round(raw), MIN_SEMITONES, MAX_SEMITONES);
    this.pitchDraft = semitones;
    await this.dawService.applyTranspose(semitones, this.qualityDraft);
    this.pitchDraft = null;
    this.cdr.detectChanges();
  }

  resetPitch(): void {
    this.pitchDraft = 0;
    void this.applyPitch();
  }

  /** Muestra el borrador si existe; si no, el pitch que la pista tiene realmente aplicado. */
  getTrackPitchDraft(trackId: string): number {
    return this.trackPitchDraft.get(trackId)
      ?? this.state.tracks.find(track => track.id === trackId)?.pitchSemitones
      ?? 0;
  }

  setTrackPitchDraft(trackId: string, value: number | string | null): void {
    const parsed = value === null || value === '' ? NaN : Number(value);
    if (Number.isFinite(parsed)) this.trackPitchDraft.set(trackId, parsed);
    else this.trackPitchDraft.delete(trackId);
  }

  async applyTrackPitch(trackId: string): Promise<void> {
    if (this.isTrackBusy(trackId)) return;
    const draft = this.trackPitchDraft.get(trackId);
    if (draft === undefined) return;

    const semitones = clamp(Math.round(draft), MIN_SEMITONES, MAX_SEMITONES);
    this.trackPitchProcessing.add(trackId);
    this.cdr.detectChanges();
    try {
      await this.dawService.applyTransposeToTrack(trackId, semitones, this.qualityDraft);
    } catch (error) {
      console.error(`Error applying pitch to track ${trackId}:`, error);
      this.alert(`No se pudo aplicar el pitch a la pista: ${this.errorMessage(error)}`);
    } finally {
      this.trackPitchDraft.delete(trackId);
      this.trackPitchProcessing.delete(trackId);
      this.cdr.detectChanges();
    }
  }

  /** true si la pista está esperando en la cola o renderizándose. */
  isTrackBusy(trackId: string): boolean {
    return this.trackPitchProcessing.has(trackId) || this.dawService.getTrackProgress(trackId) !== undefined;
  }

  /** Texto del botón: APLICAR en reposo, porcentaje mientras se procesa. */
  trackPitchLabel(trackId: string): string {
    if (!this.isTrackBusy(trackId)) return 'APLICAR';
    const progress = this.dawService.getTrackProgress(trackId);
    return progress === undefined ? 'En cola…' : `${Math.round(progress * 100)}%`;
  }

  // ───────────────────────────── Transporte y mezclador ─────────────────────────────

  toggleMixer(): void { this.mixerCollapsed = !this.mixerCollapsed; }
  play(): void { void this.dawService.start(); }
  pause(): void { this.dawService.pause(); }
  stop(): void { this.dawService.stop(); }

  // ───────────────────────────── Utilidades ─────────────────────────────

  private errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
  private alert(message: string): void { this.win.alert(message); }
  private get win(): Window { return this.document.defaultView || window; }
}