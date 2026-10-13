import { Component, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl, FormGroup } from '@angular/forms';
import { ExportService } from '../../services/export.service';
import { TransposeService } from '../../services/transpose.service';
import { FileImportService } from '../../services/file-import.service';
import { StatusService } from '../../services/status.service';
import { MetronomeService } from '../../../../core/metronome/metronome.service';
import { Song } from '../../models/song.model';
import { SongHeaderComponent } from '../../components/song-header/song-header';
import { EditorPanelComponent } from '../../components/editor-panel/editor-panel';
import { YoutubePanelComponent } from '../../components/youtube-panel/youtube-panel';
import { TransposeModalComponent } from '../../components/transpose-modal/transpose-modal';
import { SongDialogComponent } from '../../components/song-dialog/song-dialog';
import { SongPreviewComponent } from '../../components/song-preview/song-preview';
import { SongPreviewData } from '../../models/song-preview.model';
import { SongPreviewStats } from '../../models/song-preview-stats.model';
import { TransposeResult } from '../../models/transpose-result.model';

@Component({
  selector: 'app-visualizador',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SongHeaderComponent,
    EditorPanelComponent,
    SongPreviewComponent,
    YoutubePanelComponent,
    TransposeModalComponent,
    SongDialogComponent
  ],
  templateUrl: './visualizador.component.html',
  styleUrls: ['./visualizador.component.scss']
})
export class VisualizadorComponent implements AfterViewInit {

  structureContent = '';
  songContent = '';
  previewData: SongPreviewData | null = null;
  showSongDialog = false;
  isTransposeOpen = false;
  isYoutubePanelOpen = false;

  songForm = new FormGroup({
    title: new FormControl(''),
    artist: new FormControl(''),
    key: new FormControl('Ab'),
    mode: new FormControl(''),
    tempo: new FormControl(72),
    time: new FormControl('4/4'),
    metronomeVolume: new FormControl(50)
  });

  constructor(
    private metronome: MetronomeService,
    private exportService: ExportService,
    private transposeService: TransposeService,
    private fileImportService: FileImportService,
    public statusService: StatusService,
    private cdr: ChangeDetectorRef
  ) { }

  get isMetronomePlaying(): boolean {
    return this.metronome.isPlaying();
  }

  ngAfterViewInit(): void {
    this.updatePreviewData();

    this.songForm.valueChanges.subscribe(values => {
      if (values.metronomeVolume !== null && values.metronomeVolume !== undefined) {
        this.metronome.setVolume(Number(values.metronomeVolume) / 100);
      }

      this.updatePreviewData();
    });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;

    if (!input.files || !input.files[0]) {
      return;
    }

    const file = input.files[0];

    try {
      const content = await file.text();
      const importedSong = this.fileImportService.parseTxtFormat(content);

      if (!importedSong) {
        return;
      }

      this.songForm.patchValue({
        title: importedSong.title || '',
        artist: importedSong.artist || '',
        key: importedSong.key || 'C',
        mode: importedSong.mode || '',
        tempo: Number(importedSong.tempo) || 72,
        time: importedSong.time_signature || '4/4'
      });

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

  exportTXT(): void {
    this.exportService.exportTXT();
  }

  exportPDF(): void {
    this.exportService.exportPDF();
  }

  showLoadSongDialog(): void {
    this.showSongDialog = true;
  }

  closeSongDialog(): void {
    this.showSongDialog = false;
  }

  toggleYoutubePanel(): void {
    this.isYoutubePanelOpen = !this.isYoutubePanelOpen;
  }

  toggleMetronome(): void {
    if (this.metronome.isPlaying()) {
      this.metronome.stop();
      return;
    }

    const tempo = Number(this.songForm.get('tempo')?.value) || 72;
    this.metronome.start(tempo);
  }

  applyTranspose(result: TransposeResult): void {
    if (result.semitones !== 0) {
      this.songContent = this.transposeService.transposeText(
        this.songContent,
        result.semitones,
        result.accidentalPref
      );

      this.songForm.patchValue(
        {
          key: result.targetKey
        },
        { emitEvent: false }
      );

      this.updatePreviewData();
    }

    this.closeTranspose();
  }

  onEditorChange(): void {
    this.updatePreviewData();
  }

  onSongSelected(song: Song): void {

    this.songForm.patchValue({
      title: song.title || '',
      artist: song.artist || '',
      key: song.key_root || 'C',
      mode: song.key_mode || '',
      tempo: Number(song.tempo) || 72,
      time: song.time_signature || '4/4'
    }, { emitEvent: false });

    this.structureContent = song.structure || '';
    this.songContent = song.chords_lyrics || '';
    this.updatePreviewData();

    this.cdr.detectChanges();

  }

  private updatePreviewData(): void {
    const values = this.songForm.value;

    this.previewData = {
      title: values.title || '',
      artist: values.artist || '',
      key: values.key || 'C',
      mode: values.mode || '',
      tempo: values.tempo || 72,
      time: values.time || '4/4',
      structure: this.structureContent || '',
      songText: this.songContent || ''
    };
  }

  previewStats: SongPreviewStats = {
    sections: 0,
    lines: 0,
    chords: 0
  };

  onPreviewStatsChanged(stats: SongPreviewStats): void {
    this.previewStats = stats;
  }
}