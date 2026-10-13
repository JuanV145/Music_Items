import { Injectable } from '@angular/core';
import { ImportedSong } from '../models/imported-song.model';

@Injectable({
  providedIn: 'root'
})
export class FileImportService {

  parseTxtFormat(content: string): ImportedSong | null {
    const lines = content.split(/\r?\n/);

    const structStartIdx = lines.indexOf('=== ESTRUCTURA ===');
    const cifradoStartIdx = lines.indexOf('=== CIFRADO ===');

    if (structStartIdx === -1 || cifradoStartIdx === -1) {
      console.error(
        'Formato de archivo no válido. Debe contener === ESTRUCTURA === y === CIFRADO ==='
      );
      return null;
    }

    let title = '';
    let artist = '';
    let key = '';
    let mode = '';
    let tempo = '72';
    let time = '4/4';

    const metadataLines = lines.slice(0, structStartIdx);

    metadataLines.forEach(line => {
      const trimmed = line.trim();

      if (!trimmed) {
        return;
      }

      const keyMatch = trimmed.match(/^(?:Clave|Tono|Key):\s*([^\s]+)/i);

      if (keyMatch) {
        const keyValue = keyMatch[1];
        const modeMatch = keyValue.match(/^([A-G][b#]?)(m)?$/);

        if (modeMatch) {
          key = modeMatch[1];
          mode = modeMatch[2] || '';
        } else {
          key = keyValue;
          mode = '';
        }
      }

      const tempoMatch = trimmed.match(/Tempo:\s*(\d+)/i);

      if (tempoMatch) {
        tempo = tempoMatch[1];
      }

      const timeMatch = trimmed.match(/Comp[áa]s:\s*([^\s]+)/i);

      if (timeMatch) {
        time = timeMatch[1];
      }

      if (trimmed.startsWith('Título:') || trimmed.startsWith('Title:')) {
        title = trimmed.replace(/^(?:Título|Title):\s*/i, '');
      }

      if (trimmed.startsWith('Artista:') || trimmed.startsWith('Artist:')) {
        artist = trimmed.replace(/^(?:Artista|Artist):\s*/i, '');
      }
    });

    if (!title && metadataLines.length >= 1) {
      const firstLine = metadataLines[0].trim();

      if (!firstLine.includes(':')) {
        title = firstLine;
      }
    }

    if (!artist && metadataLines.length >= 2) {
      const secondLine = metadataLines[1].trim();

      if (!secondLine.includes(':')) {
        artist = secondLine;
      }
    }

    if (!key && metadataLines.length >= 3) {
      const thirdLine = metadataLines[2].trim();

      if (!thirdLine.includes(':')) {
        const keyValue = thirdLine;
        const modeMatch = keyValue.match(/^([A-G][b#]?)(m)?$/);

        if (modeMatch) {
          key = modeMatch[1];
          mode = modeMatch[2] || '';
        } else {
          key = keyValue;
          mode = '';
        }
      }
    }

    if (tempo === '72' && metadataLines.length >= 4) {
      const fourthLine = metadataLines[3].trim();

      if (!fourthLine.includes(':')) {
        tempo = fourthLine || '72';
      }
    }

    if (time === '4/4' && metadataLines.length >= 5) {
      const fifthLine = metadataLines[4].trim();

      if (!fifthLine.includes(':')) {
        time = fifthLine || '4/4';
      }
    }

    const structLines = lines.slice(
      structStartIdx + 1,
      cifradoStartIdx
    );

    const songLines = lines.slice(cifradoStartIdx + 1);

    return {
      title,
      artist,
      key,
      mode,
      tempo,
      time_signature: time,
      structure: structLines.join('\n').trim(),
      chords_lyrics: songLines.join('\n').trim()
    };
  }
}