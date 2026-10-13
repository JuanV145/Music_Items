import {
    Component,
    ChangeDetectorRef,
    EventEmitter,
    Output,
    OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { SongService } from '../../services/song.service';
import { StatusService } from '../../services/status.service';
import { Song } from '../../models/song.model';

@Component({
    selector: 'app-song-dialog',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './song-dialog.html',
    styleUrls: ['./song-dialog.scss']
})
export class SongDialogComponent implements OnInit {

    @Output() songSelected = new EventEmitter<Song>();
    @Output() closed = new EventEmitter<void>();

    songs: Song[] = [];
    loading = false;
    error = '';

    constructor(
        private songService: SongService,
        private statusService: StatusService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.loadSongs();
    }

    async loadSongs(): Promise<void> {
        this.error = '';

        try {
            const songs = await this.songService.getSongs();

            this.songs = songs;

            this.cdr.detectChanges();

        } catch (error) {
            console.error('Error loading songs:', error);

            this.error = 'Error al cargar la lista de canciones';

            this.cdr.detectChanges();
        }
    }

    async loadSong(song: Song): Promise<void> {
        if (song.id === undefined) return;

        try {
            const songData = await this.songService.loadSong(song.id);

            this.songSelected.emit(songData);
            this.statusService.show(
                `✓ Canción cargada: ${songData.title}`,
                2000
            );

            this.close();
        } catch (error) {
            console.error('Error loading song:', error);
            this.statusService.show(
                '✗ Error al cargar la canción',
                2000
            );
        }
    }

    async deleteSong(song: Song): Promise<void> {
        if (song.id === undefined) return;

        const confirmed = confirm(
            '¿Estás seguro de que quieres eliminar esta canción?'
        );

        if (!confirmed) return;

        try {
            await this.songService.deleteSong(song.id);

            this.statusService.show(
                '✓ Canción eliminada correctamente',
                2000
            );

            await this.loadSongs();
        } catch (error) {
            console.error('Error deleting song:', error);

            this.statusService.show(
                '✗ Error al eliminar la canción',
                2000
            );
        }
    }

    close(): void {
        this.closed.emit();
    }

    onOverlayClick(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.close();
        }
    }
}