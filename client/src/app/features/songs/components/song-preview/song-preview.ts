import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { SongPreviewStats } from '../../models/song-preview-stats.model';
import { CommonModule } from '@angular/common';

import { PreviewRendererService } from '../../services/preview-renderer.service';
import { SongPreviewData } from '../../models/song-preview.model';

@Component({
  selector: 'app-song-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './song-preview.html',
  styleUrls: ['./song-preview.scss']
})
export class SongPreviewComponent implements AfterViewInit, OnChanges {
  @Input() data: SongPreviewData | null = null;
  @Output() statsChanged = new EventEmitter<SongPreviewStats>();

  @ViewChild('chartPage')
  chartPage!: ElementRef<HTMLElement>;

  private viewReady = false;

  constructor(private previewRenderer: PreviewRendererService) { }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.viewReady) {
      this.render();
    }
  }

  private render(): void {
    if (!this.data || !this.chartPage) {
      return;
    }

    const stats = this.previewRenderer.renderPreview(
      this.data,
      this.chartPage.nativeElement
    );

    this.statsChanged.emit(stats);
  }
}