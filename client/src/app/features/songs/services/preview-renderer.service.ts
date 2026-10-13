import { Injectable } from '@angular/core';
import { SongParserService } from '../../../core/song-parser/song-parser.service';
import { SongPreviewData } from '../models/song-preview.model';
import { SongPreviewStats } from '../models/song-preview-stats.model';

@Injectable({
  providedIn: 'root'
})
export class PreviewRendererService {

  private CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  private CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  private SEC_COLOR: Record<string, number> = {
    intro: 0, verse: 1, verso: 1, 'pre-chorus': 2, 'pre-coro': 2,
    chorus: 3, coro: 3, 'post-chorus': 4, 'post-coro': 4,
    bridge: 5, puente: 5, outro: 6, interlude: 4, interludio: 4,
  };

  private SEC_ABBREV: Record<string, string> = {
    intro: 'I', verse: 'V', verso: 'V', 'pre-chorus': 'PC', 'pre-coro': 'PC',
    chorus: 'C', coro: 'C', 'post-chorus': 'PC', 'post-coro': 'PC',
    bridge: 'B', puente: 'P', outro: 'O', interlude: 'IL', interludio: 'IL',
  };

  private PDF_SEC_COLORS = ['#5046e5', '#059669', '#db2777', '#d97706', '#2563eb', '#7c3aed', '#b45309'];

  constructor(
    private songParser: SongParserService
  ) {
    this.SEC_ABBREV['post-chorus'] = 'PC';
    this.SEC_ABBREV['post-coro'] = 'PC';
  }

  renderPreview(
    data: SongPreviewData,
    chartPageEl: HTMLElement
  ): SongPreviewStats {

    const title = data.title;
    const artist = data.artist;
    const key = data.key;
    const mode = data.mode;
    const tempo = data.tempo;
    const time = data.time;
    const songText = data.songText;
    const structText = data.structure;
    const keyDisplay = key + mode;

    const sections = this.songParser.parseSong(songText);
    const structure = structText ? this.songParser.parseStructure(structText) : [];

    const sectionCount = sections.filter(s => s.label).length;
    const lineCount = songText.split('\n').filter(l => l.trim()).length;

    const chordSet = new Set<string>();

    songText.split('\n').forEach(line => {
      if (this.songParser.isChordLine(line)) {
        line.split(/\s+/).filter(Boolean).forEach(token => {
          if (this.songParser.isChordToken(token)) {
            chordSet.add(token);
          }
        });
      }
    });

    const chordCount = chordSet.size;

    const structHTML = structure.map(({ label, note, ci, abbrev, reps }: any) => {
      const esc = (s: string) => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `
        <div class="struct-pill">
          <div class="struct-circle sc-${ci}">${esc(abbrev)}${reps ? `<sup class="struct-rep">x${reps}</sup>` : ''}</div>
          <span class="struct-text">${esc(label)}${note ? ` <span class="struct-reps-note">(${esc(note)})</span>` : ''}${reps ? ` <span class="struct-reps-note">(x${reps})</span>` : ''}</span>
        </div>`;
    }).join('');

    let gridHTML = '';
    for (const sec of sections) {
      if (!sec.label && !sec.blocks.length) continue;
      const ci = this.colorOf(sec.label || 'x');
      const abbrev = this.abbrevOf(sec.label || 'x');

      let bodyHTML = '';
      for (const blk of sec.blocks) {
        if (blk.type === 'spacer') {
          bodyHTML += '<div style="height:4px"></div>';
        } else if (blk.type === 'chords-only') {
          bodyHTML += `<span class="mono-chords-only">${this.escapeHtml(blk.chords)}</span>`;
        } else if (blk.type === 'pair') {

          bodyHTML += `<div class="mono-pair">` +
            `<span class="mono-chord">${this.escapeHtml(blk.chords)}</span>` +
            `<span class="mono-lyric">${this.escapeHtml(blk.lyrics)}</span>` +
            `</div>`;
        } else if (blk.type === 'lyrics') {
          bodyHTML += `<span class="mono-lyric">${this.escapeHtml(blk.text)}</span>`;
        }
      }

      gridHTML += `<div class="section-block">` +
        (sec.label
          ? `<div class="section-hdr">
             <div class="section-badge sc-${ci}">${this.escapeHtml(abbrev)}</div>
             <span class="section-lbl sl-${ci}">${this.escapeHtml(sec.label)}</span>
             ${sec.note ? `<span class="section-note">${this.escapeHtml(sec.note)}</span>` : ''}
           </div>`
          : '') +
        `<div class="section-body">${bodyHTML}</div></div>`;
    }

    chartPageEl.innerHTML = `
      <div class="chart-top">
        <div>
          <div class="chart-title">${this.escapeHtml(title)}</div>
          ${artist ? `<div class="chart-artist">${this.escapeHtml(artist)}</div>` : ''}
        </div>
        <div class="chart-meta">
          Clave: <strong>${this.escapeHtml(keyDisplay)}</strong><br>
          Tempo: <strong>${this.escapeHtml(String(tempo))} BPM</strong><br>
          Compás: <strong>${this.escapeHtml(time)}</strong>
        </div>
      </div>
      ${structure.length ? `<div class="structure-bar">${structHTML}</div>` : ''}
      <div class="sections-grid">${gridHTML}</div>`;

    return {
      sections: sectionCount,
      lines: lineCount,
      chords: chordCount
    };
  }

  private escapeHtml(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>');
  }

  private colorOf(label: string): number {
    return this.songParser.colorOf(label);
  }

  private abbrevOf(label: string): string {
    return this.songParser.abbrevOf(label);
  }
}