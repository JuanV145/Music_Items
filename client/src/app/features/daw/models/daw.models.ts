/** Modelos, tipos y constantes compartidos por el componente, el servicio y el motor DSP. */

export const MIN_SEMITONES = -24;
export const MAX_SEMITONES = 24;
export const MIN_FADER_DB = -60;
export const MAX_FADER_DB = 12;

export type PitchMode = 'voice' | 'polyphonic' | 'fast';
export type PitchQuality = 'Fast' | 'Balanced' | 'High Quality';
export type ClipInteraction = 'move' | 'resize-left' | 'resize-right';

export interface AudioTrack {
  id: string;
  serverId?: number;
  name: string;
  color: string;
  file: File | null;
  /** Ruta relativa en el backend; permite recargar el original sin retener PCM duplicado. */
  audioFilePath?: string;
  audioBuffer: AudioBuffer | null;
  originalAudioBuffer: AudioBuffer | null;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  waveform: number[] | null;
  /** Inicio del clip en la línea de tiempo (segundos). */
  clipOffset: number;
  /** Duración audible del clip (segundos). */
  clipDuration: number;
  /** Desplazamiento dentro del buffer fuente tras recortar el borde izquierdo. */
  sourceOffset: number;
  meterLevel: number;
  /** Semitonos propios de la pista (valor absoluto) ya renderizados en audioBuffer. */
  pitchSemitones: number;
}

export type TrackChanges = Partial<
  Omit<AudioTrack, 'audioBuffer' | 'originalAudioBuffer' | 'file' | 'serverId'>
>;

export interface PlaybackNode {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  panNode: StereoPannerNode;
  analyser: AnalyserNode;
}

export interface DawState {
  tracks: AudioTrack[];
  tempo: number;
  timeSignature: string;
  isPlaying: boolean;
  currentTime: number;
  audioContext: AudioContext | null;
  masterGain: GainNode | null;
  masterAnalyser: AnalyserNode | null;
  masterVolume: number;
  playbackNodes: Map<string, PlaybackNode>;
  /** Último valor de pitch global aplicado (sirve de referencia; cada pista guarda el suyo). */
  globalTranspose: number;
  currentProjectId?: number;
}

export interface TrackResponse {
  id: number;
  project_id: number;
  name: string;
  color?: string;
  audio_file_path: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  clip_offset: number;
  clip_duration: number;
  created_at: string;
  updated_at: string | null;
}

export interface ProjectResponse {
  id: number;
  name: string;
  tempo: number;
  timeSignature: string;
  transpose: number;
  created_at: string;
  updated_at: string | null;
  tracks: TrackResponse[];
}

const TRACK_PALETTE = [
  '#4f8ed8', '#36a985', '#c27a35', '#9861cf', '#cf5f78', '#44a5ad',
  '#a0a64e', '#cc7d49', '#5674c8', '#b35a9b', '#699c65', '#bc9c3d'
];

export function isHexColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

/** Color determinista a partir del nombre de la pista. */
export function defaultTrackColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return TRACK_PALETTE[Math.abs(hash) % TRACK_PALETTE.length];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}