export interface Song {
  id?: number;
  title: string;
  artist?: string | null;
  key_root: string;
  key_mode: string;
  tempo: string;
  time_signature: string;
  structure?: string | null;
  chords_lyrics: string;
  created_at?: string;
}