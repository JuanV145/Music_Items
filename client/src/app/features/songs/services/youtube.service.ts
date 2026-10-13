import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class YoutubeService {

  private readonly CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  getEmbedUrl(url: string): string | null {
    const videoId = this.extractYouTubeVideoId(url);

    if (!videoId) {
      return null;
    }

    const params = new URLSearchParams({
      rel: '0',
      modestbranding: '1',
      showinfo: '0',
      autohide: '1',
      fs: '0',
      iv_load_policy: '3'
    });

    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  }

  extractYouTubeVideoId(url: string): string | null {
    if (!url) {
      return null;
    }

    try {
      const parsedUrl = new URL(url.trim());
      const hostname = parsedUrl.hostname.toLowerCase();

      let videoId: string | null = null;

      if (hostname === 'youtu.be') {
        videoId = parsedUrl.pathname.replace('/', '');
      } else if (
        hostname.includes('youtube.com') ||
        hostname.includes('youtube-nocookie.com')
      ) {
        if (parsedUrl.pathname === '/watch') {
          videoId = parsedUrl.searchParams.get('v');
        } else if (parsedUrl.pathname.startsWith('/embed/')) {
          videoId = parsedUrl.pathname.split('/embed/')[1];
        } else if (parsedUrl.pathname.startsWith('/shorts/')) {
          videoId = parsedUrl.pathname.split('/shorts/')[1];
        } else if (parsedUrl.pathname.startsWith('/live/')) {
          videoId = parsedUrl.pathname.split('/live/')[1];
        }
      }

      if (!videoId) {
        return null;
      }

      videoId = videoId.split(/[?&#/]/)[0];

      if (videoId.length !== 11) {
        return null;
      }

      for (const char of videoId) {
        if (!this.CHARS.includes(char)) {
          return null;
        }
      }

      return videoId;
    } catch {
      return null;
    }
  }
}