import { Component, OnInit, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { SongHeaderComponent } from '../../components/song-header/song-header';
import { TransposeModalComponent } from '../../components/transpose-modal/transpose-modal';
import { YoutubePanelComponent } from '../../components/youtube-panel/youtube-panel';

import { SongService } from '../../services/song.service';
import { Song } from '../../models/song.model';
import { SongDialogComponent } from '../../components/song-dialog/song-dialog';
import { ImportedSong } from '../../models/imported-song.model';
import { MetronomeService } from '../../../../core/metronome/metronome.service';
import { TransposeService } from '../../services/transpose.service';
import { ExportService } from '../../services/export.service';
import { FileImportService } from '../../services/file-import.service';
import { StatusService } from '../../services/status.service';
import { SongFormService } from '../../services/song-form.service';
import { EditorPanelComponent } from '../../components/editor-panel/editor-panel';
import { SongPreviewComponent } from '../../components/song-preview/song-preview';
import { SongPreviewData } from '../../models/song-preview.model';
import { SongPreviewStats } from '../../models/song-preview-stats.model';
import { TransposeResult } from '../../models/transpose-result.model';

@Component({
  selector: 'app-modificar',
  standalone: true,
  imports: [
    CommonModule,
    SongHeaderComponent,
    EditorPanelComponent,
    SongPreviewComponent,
    TransposeModalComponent,
    YoutubePanelComponent,
    SongDialogComponent
  ],
  templateUrl: './modificar.component.html',
  styleUrls: ['./modificar.component.scss']
})
export class ModificarComponent implements OnInit, OnDestroy, AfterViewInit {
  private songFormService = inject(SongFormService);
  headerForm!: FormGroup;

  songId: number | null = null;
  structureContent: string = '';
  songContent: string = '';
  previewData: SongPreviewData | null = null;
  previewStats: SongPreviewStats = {
    sections: 0,
    lines: 0,
    chords: 0
  };
  onPreviewStatsChanged(stats: SongPreviewStats): void {
    this.previewStats = stats;
  }
  showSongDialog = false;
  isTransposeOpen = false;

  constructor(
    private route: ActivatedRoute,
    private songService: SongService,
    private metronomeService: MetronomeService,
    private transposeService: TransposeService,
    private exportService: ExportService,
    private fileImportService: FileImportService,
    public statusService: StatusService
  ) {
    this.headerForm = this.songFormService.createForm();
  }

  get isMetronomePlaying(): boolean {
    return this.metronomeService.isPlaying();
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.songId = Number(idParam);
      this.loadSong(this.songId);
    }
  }

  ngOnDestroy(): void {
    if (this.metronomeService.isPlaying()) {
      this.metronomeService.stop();
    }
  }

  async loadSong(id: number): Promise<void> {
    try {
      const song = await this.songService.loadSong(id);

      this.songFormService.patchSong(this.headerForm, song);

      this.structureContent = song.structure || '';
      this.songContent = song.chords_lyrics || '';
      this.updatePreviewData();

    } catch (error) {
      console.error('Error al cargar la canción:', error);
    }
  }

  onEditorChange(): void {
    this.updatePreviewData();
  }

  toggleMetronome(): void {
    if (this.metronomeService.isPlaying()) {
      this.metronomeService.stop();
    } else {
      const tempoNum = Number(this.headerForm.get('tempo')?.value) || 120;
      this.metronomeService.start(tempoNum);
    }
  }

  async saveSongToDB(): Promise<void> {
    if (this.headerForm.invalid) {
      alert('Por favor completa los campos requeridos (Título).');
      return;
    }

    const songData = this.songFormService.toSong(
      this.headerForm,
      this.structureContent,
      this.songContent,
      this.songId
    );

    try {
      const savedSong = await this.songService.saveSong(songData);

      if (!this.songId && savedSong?.id) {
        this.songId = savedSong.id;
      }

      alert('¡Canción guardada con éxito!');
    } catch (error: unknown) {
      console.error('Error al guardar la canción:', error);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];

    try {
      const content = await file.text();
      const importedSong: ImportedSong | null =
        this.fileImportService.parseTxtFormat(content);

      if (!importedSong) {
        return;
      }

      this.songFormService.patchImportedSong(
        this.headerForm,
        importedSong
      );

      this.structureContent = importedSong.structure || '';
      this.songContent = importedSong.chords_lyrics || '';
      this.updatePreviewData();

    } catch (error) {
      console.error('Error importando archivo:', error);
    } finally {
      input.value = '';
    }
  }

  openTranspose(): void {
    this.isTransposeOpen = true;
  }

  closeTranspose(): void {
    this.isTransposeOpen = false;
  }

  applyTranspose(result: TransposeResult): void {
    if (result.semitones !== 0) {
      this.songContent = this.transposeService.transposeText(
        this.songContent,
        result.semitones,
        result.accidentalPref
      );

      this.headerForm.patchValue(
        {
          key: result.targetKey
        },
        { emitEvent: false }
      );

      this.updatePreviewData();
    }

    this.closeTranspose();
  }

  exportTXT(): void {
    this.exportService.exportTXT();
  }

  exportPDF(): void {
    this.exportService.exportPDF();
  }

  ngAfterViewInit(): void {
    this.updatePreviewData();

    this.headerForm.valueChanges.subscribe(() => {
      this.updatePreviewData();
    });
  }

  showLoadSongDialog(): void {
    this.showSongDialog = true;
  }

  closeSongDialog(): void {
    this.showSongDialog = false;
  }

  onSongSelected(song: Song): void {
    this.songId = song.id ?? null;

    this.songFormService.patchSong(this.headerForm, song);

    this.structureContent = song.structure || '';
    this.songContent = song.chords_lyrics || '';
    this.updatePreviewData();

  }

  private updatePreviewData(): void {
    const values = this.headerForm.value;

    this.previewData = {
      title: values.title || '',
      artist: values.artist || '',
      key: values.key || 'C',
      mode: values.mode || '',
      tempo: values.tempo || '120',
      time: values.time || '4/4',
      structure: this.structureContent || '',
      songText: this.songContent || ''
    };
  }
}