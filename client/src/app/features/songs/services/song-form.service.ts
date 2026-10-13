import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Song } from '../models/song.model';
import { ImportedSong } from '../models/imported-song.model';

@Injectable({
    providedIn: 'root'
})
export class SongFormService {
    constructor(private fb: FormBuilder) { }

    createForm(): FormGroup {
        return this.fb.group({
            title: ['', Validators.required],
            artist: [''],
            key: ['C'],
            mode: [''],
            tempo: ['120'],
            time: ['4/4'],
            metronomeVolume: [100],
            youtubeUrl: ['']
        });
    }

    patchSong(form: FormGroup, song: Song): void {
        form.patchValue({
            title: song.title || '',
            artist: song.artist || '',
            key: song.key_root || 'C',
            mode: song.key_mode || '',
            tempo: song.tempo || '120',
            time: song.time_signature || '4/4'
        });
    }

    patchImportedSong(form: FormGroup, importedSong: ImportedSong): void {
        form.patchValue({
            title: importedSong.title || form.get('title')?.value,
            artist: importedSong.artist || form.get('artist')?.value,
            key: importedSong.key || form.get('key')?.value,
            mode: importedSong.mode || form.get('mode')?.value,
            tempo: importedSong.tempo || form.get('tempo')?.value,
            time: importedSong.time_signature || form.get('time')?.value
        });
    }
    toSong(
        form: FormGroup,
        structureContent: string,
        songContent: string,
        songId: number | null
    ): Song {
        const values = form.value;

        const song: Song = {
            title: values.title || '',
            artist: values.artist || null,
            key_root: values.key || 'C',
            key_mode: values.mode || '',
            tempo: String(values.tempo || '120'),
            time_signature: values.time || '4/4',
            structure: structureContent || null,
            chords_lyrics: songContent || ''
        };

        if (songId !== null && songId !== undefined) {
            song.id = Number(songId);
        }

        return song;
    }
}