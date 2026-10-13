import { Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Inject } from '@angular/core';
import { SongParserService } from '../../../core/song-parser/song-parser.service';
import { StatusService } from './status.service';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private doc: Document;

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private songParser: SongParserService,
    private statusService: StatusService
  ) {
    this.doc = document;
  }

  exportTXT(): void {
    const titleEl = this.doc.getElementById('songTitle');
    const artistEl = this.doc.getElementById('songArtist');
    const keyEl = this.doc.getElementById('currentKey');
    const modeEl = this.doc.getElementById('currentMode');
    const tempoEl = this.doc.getElementById('songTempo');
    const timeEl = this.doc.getElementById('songTime');
    const structEl = this.doc.getElementById('structEditor');
    const editorEl = this.doc.getElementById('editor');

    const title = titleEl ? (titleEl as HTMLInputElement).value.trim() : 'Cifrado';
    const artist = artistEl ? (artistEl as HTMLInputElement).value.trim() : '';
    const key = keyEl ? (keyEl as HTMLSelectElement).value : '';
    const mode = modeEl ? (modeEl as HTMLSelectElement).value : '';
    const tempo = tempoEl ? (tempoEl as HTMLInputElement).value : '72';
    const time = timeEl ? (timeEl as HTMLInputElement).value : '4/4';
    const structText = structEl ? (structEl as HTMLTextAreaElement).value : '';
    const songText = editorEl ? (editorEl as HTMLTextAreaElement).value : '';

    const keyDisplay = key + mode;

    let out = `${title}\n`;
    if (artist) out += `${artist}\n`;
    out += `Clave: ${keyDisplay}   Tempo: ${tempo}   Compás: ${time}\n`;

    if (structText.trim()) {
      out += `\n=== ESTRUCTURA ===\n${structText}\n`;
    }

    out += `\n=== CIFRADO ===\n${songText}\n`;

    const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = this.doc.createElement('a');
    const safeName = (title || 'cifrado').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || 'cifrado';
    a.href = url;
    a.download = `${safeName}.txt`;
    this.doc.body.appendChild(a);
    a.click();
    this.doc.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showStatus('TXT exportado ✓');
  }

  private getColorOf(label: string): number {
    return this.songParser.colorOf(label);
  }

  exportPDF(): void {
    this.showStatus('Generando PDF...');

    const titleEl = this.doc.getElementById('songTitle');
    const artistEl = this.doc.getElementById('songArtist');
    const keyRootEl = this.doc.getElementById('currentKey');
    const keyModeEl = this.doc.getElementById('currentMode');
    const tempoEl = this.doc.getElementById('songTempo');
    const timeSigEl = this.doc.getElementById('songTime');
    const structEl = this.doc.getElementById('structEditor');
    const editorEl = this.doc.getElementById('editor');

    const title = titleEl ? (titleEl as HTMLInputElement).value.trim() : 'Sin título';
    const artist = artistEl ? (artistEl as HTMLInputElement).value.trim() : null;
    const keyRoot = keyRootEl ? (keyRootEl as HTMLSelectElement).value : '';
    const keyMode = keyModeEl ? (keyModeEl as HTMLSelectElement).value : '';
    const keyDisplay = keyRoot + keyMode;
    const tempo = tempoEl ? (tempoEl as HTMLInputElement).value : '—';
    const timeSig = timeSigEl ? (timeSigEl as HTMLInputElement).value : '—';
    const structText = structEl ? (structEl as HTMLTextAreaElement).value.trim() : '';
    const songText = editorEl ? (editorEl as HTMLTextAreaElement).value.trim() : '';

    const sections = this.songParser.parseSong(songText).filter(s => s.label || s.blocks.length);
    const structure = structText ? this.songParser.parseStructure(structText) : [];

    const jsPDF = (window as any).jspdf?.jsPDF ?? (window as any).jsPDF;
    if (!jsPDF) {
      this.showStatus('Error: jsPDF no está disponible. Por favor, incluya la biblioteca jsPDF.', 3000);
      return;
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p' });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const columnGap = 6;
    const usableWidth = pageWidth - 2 * margin;
    const colWidth = (usableWidth - columnGap) / 2;
    const colX = [margin, margin + colWidth + columnGap];
    const footerSpace = 8;
    const bottomLimit = pageHeight - margin - footerSpace;
    const boxGap = 4;
    const pad = 3;

    const PDF_SEC_COLORS = ['#5046e5', '#059669', '#db2777', '#d97706', '#2563eb', '#7c3aed', '#b45309'];

    let maxChars = 10;
    for (const sec of sections) {
      for (const blk of sec.blocks) {
        if (blk.type === 'pair') maxChars = Math.max(maxChars, blk.chords.length, blk.lyrics.length);
        else if (blk.type === 'chords-only') maxChars = Math.max(maxChars, blk.chords.length);
        else if (blk.type === 'lyrics') maxChars = Math.max(maxChars, blk.text.length);
      }
    }
    const innerWidth = colWidth - 2 * pad;
    let bodyFS = innerWidth / (maxChars * 0.6 * 0.3528);
    bodyFS = Math.max(8, Math.min(9, bodyFS));
    const lineH = bodyFS * 0.3528 * 1.5;

    function drawMasthead() {
      let hy = margin + 6;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.setTextColor(20, 20, 20);
      pdf.text(title, margin, hy);

      if (artist) {
        hy += 6;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9.5);
        pdf.setTextColor(140, 140, 150);
        pdf.text(artist.toUpperCase(), margin, hy);
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(90, 90, 100);
      const metaLine = `Tono: ${keyDisplay}    Tempo: ${tempo}    Compás: ${timeSig}`;
      pdf.text(metaLine, pageWidth - margin, margin + 6, { align: 'right' });

      let dividerY = margin + 12;

      if (structure.length) {
        dividerY += 2;
        const d = 5.6, badgeGap = 1.6, pillGap = 3.4, rowGap = 2.6;
        let sx = margin, sy = dividerY;

        for (const item of structure) {
          const repsText = item.reps ? ` x${item.reps}` : '';

          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7);
          const labelW = pdf.getTextWidth(item.label);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(6);
          const repsW = repsText ? pdf.getTextWidth(repsText) : 0;

          const pillW = d + badgeGap + labelW + repsW;

          if (sx + pillW > pageWidth - margin) {
            sx = margin;
            sy += d + rowGap;
          }

          const rgb = pdfHexToRgb(PDF_SEC_COLORS[item.ci]);
          pdf.setFillColor(...rgb);
          pdf.setDrawColor(...rgb);
          pdf.circle(sx + d / 2, sy + d / 2, d / 2, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(5.4);
          pdf.setTextColor(255, 255, 255);
          pdf.text(item.abbrev, sx + d / 2, sy + d / 2 + 1.3, { align: 'center' });

          const textBaseY = sy + d / 2 + 1.3;
          let tx = sx + d + badgeGap;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7);
          pdf.setTextColor(50, 50, 58);
          pdf.text(item.label, tx, textBaseY);
          tx += labelW;

          if (repsText) {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(6);
            pdf.setTextColor(150, 150, 160);
            pdf.text(repsText, tx, textBaseY);
          }

          sx += pillW + pillGap;
        }
        dividerY = sy + d + 3;
      }

      pdf.setDrawColor(210, 210, 215);
      pdf.setLineWidth(0.25);
      pdf.line(margin, dividerY, pageWidth - margin, dividerY);
      pdf.setTextColor(0, 0, 0);

      return dividerY + 5;
    }

    function drawContinuationHeader() {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(120, 120, 130);
      pdf.text(`${title} (continuación)`, margin, margin + 4);
      pdf.setTextColor(0, 0, 0);
      pdf.setDrawColor(210, 210, 215);
      pdf.setLineWidth(0.25);
      pdf.line(margin, margin + 7, pageWidth - margin, margin + 7);
      return margin + 12;
    }

    function boxHeight(sec: any) {
      let h = pad * 2;
      if (sec.label) h += 6.5; // header row
      for (const blk of sec.blocks) {
        if (blk.type === 'pair') h += lineH * 2;
        else if (blk.type === 'chords-only' || blk.type === 'lyrics') h += lineH;
        else if (blk.type === 'spacer') h += lineH * 0.45;
      }
      return h;
    }

    function drawBox(sec: any, x: number, y: number) {
      const h = boxHeight(sec);
      const rgb = pdfHexToRgb(PDF_SEC_COLORS[getColorOf(sec.label || 'x')]);

      pdf.setDrawColor(220, 220, 226);
      pdf.setFillColor(250, 250, 252);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(x, y, colWidth, h, 1.6, 1.6, 'FD');

      let cy = y + pad;

      if (sec.label) {
        const badgeD = 4.6;
        pdf.setFillColor(...rgb);
        pdf.circle(x + pad + badgeD / 2, cy + badgeD / 2, badgeD / 2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6);
        pdf.setTextColor(255, 255, 255);
        pdf.text(getAbbrevOf(sec.label), x + pad + badgeD / 2, cy + badgeD / 2 + 1.3, { align: 'center' });

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.5);
        pdf.setTextColor(...pdfDarken(rgb, 0.75));
        const labelX = x + pad + badgeD + 2;
        pdf.text(sec.label.toUpperCase(), labelX, cy + badgeD / 2 + 1.3);

        if (sec.note) {
          pdf.setFont('helvetica', 'italic');
          pdf.setFontSize(6.8);
          pdf.setTextColor(150, 150, 160);
          let note = sec.note;
          const maxNoteW = colWidth - pad * 2 - 20;
          while (pdf.getTextWidth(note) > maxNoteW && note.length > 3) note = note.slice(0, -2);
          if (note !== sec.note) note = note.trim() + '…';
          pdf.text(note, x + colWidth - pad, cy + badgeD / 2 + 1.3, { align: 'right' });
        }
        cy += 6.5;
      }

      pdf.setFont('courier', 'normal');
      for (const blk of sec.blocks) {
        if (blk.type === 'spacer') {
          cy += lineH * 0.45;
          continue;
        }
        if (blk.type === 'pair') {
          pdf.setFont('courier', 'bold');
          pdf.setFontSize(bodyFS);
          pdf.setTextColor(30, 30, 30);
          pdf.text(blk.chords, x + pad, cy + lineH * 0.75);
          cy += lineH;
          pdf.setFont('courier', 'normal');
          pdf.setFontSize(bodyFS);
          pdf.setTextColor(55, 55, 60);
          pdf.text(blk.lyrics, x + pad, cy + lineH * 0.75);
          cy += lineH;
        } else if (blk.type === 'chords-only') {
          pdf.setFont('courier', 'bold');
          pdf.setFontSize(bodyFS);
          pdf.setTextColor(30, 30, 30);
          pdf.text(blk.chords, x + pad, cy + lineH * 0.75);
          cy += lineH;
        } else if (blk.type === 'lyrics') {
          pdf.setFont('courier', 'normal');
          pdf.setFontSize(bodyFS);
          pdf.setTextColor(55, 55, 60);
          pdf.text(blk.text, x + pad, cy + lineH * 0.75);
          cy += lineH;
        }
      }

      pdf.setTextColor(0, 0, 0);
      return h;
    }

    function pdfHexToRgb(hex: string) {
      const c = hex.replace('#', '');
      const n = parseInt(c, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function pdfDarken(rgb: number[], amt = 0.65) {
      return rgb.map(v => Math.round(v * amt));
    }

    function getColorOf(label: string): number {
      const key = label.toLowerCase().replace(/\s*\d+\s*$/, '').trim();
      const SEC_COLOR: Record<string, number> = {
        intro: 0, verse: 1, verso: 1, 'pre-chorus': 2, 'pre-coro': 2,
        chorus: 3, coro: 3, 'post-chorus': 4, 'post-coro': 4,
        bridge: 5, puente: 5, outro: 6, interlude: 4, interludio: 4,
      };
      for (const [k, v] of Object.entries(SEC_COLOR))
        if (key === k || key.startsWith(k)) return v;
      return 0;
    }

    function getAbbrevOf(label: string) {
      const key = label.toLowerCase().replace(/\s*\d+\s*$/, '').trim();
      const num = (label.match(/\d+$/) || [''])[0];
      const SEC_ABBREV: any = {
        intro: 'I', verse: 'V', verso: 'V', 'pre-chorus': 'PC', 'pre-coro': 'PC',
        chorus: 'C', coro: 'C', 'post-chorus': 'PC', 'post-coro': 'PC',
        bridge: 'B', puente: 'P', outro: 'O', interlude: 'IL', interludio: 'IL',
      };
      for (const [k, v] of Object.entries(SEC_ABBREV))
        if (key === k || key.startsWith(k)) return v + num;
      return label.slice(0, 2).toUpperCase() + num;
    }

    let colIndex = 0;
    let colY = [0, 0];
    let onFirstPage = true;

    function startPage(first: boolean) {
      const top = first ? drawMasthead() : drawContinuationHeader();
      colY = [top, top];
      colIndex = 0;
    }

    startPage(true);
    onFirstPage = false;

    for (const sec of sections) {
      const h = boxHeight(sec);

      if (colY[colIndex] + h > bottomLimit) {
        if (colIndex === 0 && colY[1] + h <= bottomLimit) {
          colIndex = 1;
        } else {
          pdf.addPage();
          startPage(false);
        }
      }

      drawBox(sec, colX[colIndex], colY[colIndex]);
      colY[colIndex] += h + boxGap;
    }

    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(140, 140, 150);
      pdf.text(`Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
      pdf.setTextColor(0, 0, 0);
    }

    const safeTitle = title.replace(/[^\w\- ]/g, '').replace(/\s+/g, '_') || 'cifrado';
    pdf.save(`${safeTitle}_cifrado.pdf`);
    this.showStatus('✓ PDF descargado');
  }

  private showStatus(message: string, duration = 0): void {
    this.statusService.show(message, duration);
  }
}