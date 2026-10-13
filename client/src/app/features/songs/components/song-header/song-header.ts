import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-song-header',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './song-header.html',
  styleUrls: ['./song-header.scss']
})
export class SongHeaderComponent {

  @Input() form!: FormGroup;

  @Input() viewOnly = false;
  @Input() hideMetadata = false;
  
  @Input() isMetronomePlaying = false;
  @Input() hideMetronome = false;
  @Input() hideYoutube = false;
  @Input() hideSave = false;

  @Output() toggleMetronome = new EventEmitter<void>();
  @Output() fileSelected = new EventEmitter<Event>();
  @Output() openTranspose = new EventEmitter<void>();
  @Output() exportTXT = new EventEmitter<void>();
  @Output() exportPDF = new EventEmitter<void>();
  @Output() showLoadSongDialog = new EventEmitter<void>();
  @Output() toggleYoutubePanel = new EventEmitter<void>();
  @Output() saveSong = new EventEmitter<void>();
}