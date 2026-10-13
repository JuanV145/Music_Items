import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { YoutubeService } from '../../services/youtube.service';
import { StatusService } from '../../services/status.service';

@Component({
  selector: 'app-youtube-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './youtube-panel.html',
  styleUrls: ['./youtube-panel.scss']
})
export class YoutubePanelComponent {

  @Input() open = false;

  youtubeUrl = '';
  videoUrl: SafeResourceUrl | null = null;

  constructor(
    private youtubeService: YoutubeService,
    private sanitizer: DomSanitizer,
    private statusService: StatusService
  ) { }

  loadYoutubeVideo(): void {
    const url = this.youtubeUrl.trim();

    if (!url) {
      this.videoUrl = null;
      this.statusService.show(
        'Por favor ingresa un enlace de YouTube',
        2000
      );
      return;
    }

    const embedUrl = this.youtubeService.getEmbedUrl(url);

    if (!embedUrl) {
      this.videoUrl = null;
      this.statusService.show(
        'Enlace de YouTube no válido',
        2000
      );
      return;
    }

    this.videoUrl =
      this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);

    this.statusService.show(
      'Video de YouTube cargado ✓',
      2000
    );
  }
}