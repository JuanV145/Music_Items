import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SongParserService {

  private CHROMATIC_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  private CHROMATIC_FLAT = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

  private SEC_COLOR: Record<string, number> = {
    intro:0, verse:1, verso:1, 'pre-chorus':2, 'pre-coro':2,
    chorus:3, coro:3, 'post-chorus':4, 'post-coro':4,
    bridge:5, puente:5, outro:6, interlude:4, interludio:4,
  };

  private SEC_ABBREV: Record<string, string> = {
    intro:'I', verse:'V', verso:'V', 'pre-chorus':'PC', 'pre-coro':'PC',
    chorus:'C', coro:'C', 'post-chorus':'PC', 'post-coro':'PC',
    bridge:'B', puente:'P', outro:'O', interlude:'IL', interludio:'IL',
  };

  private CHORD_PAT = /^[A-G][b#]?((maj|min|m|M)\d*|dim7?|aug|sus[24]?|add\d+|[+\-°ø]|\d+|6\/9|\([^)]*\)|[b#](5|9|11|13)|\/[A-G][b#]?)*$/;

  constructor() {
    this.SEC_ABBREV['post-chorus'] = 'PC';
    this.SEC_ABBREV['post-coro'] = 'PC';
  }

  parseSong(text: string): any[] {
    const lines = text.split('\n');
    const sections: any[] = [];
    let cur: any = null;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const sm = line.match(/^\[(.+?)\](?:\s*\|\s*(.+))?/);

      if (sm) {
        if (cur) sections.push(cur);
        cur = { label: sm[1].trim(), note: sm[2]?.trim() || '', blocks: [] };
        i++; continue;
      }

      if (!cur) { cur = { label:'', note:'', blocks:[] }; }

      if (line.trim() === '') {
        if (cur.blocks.length) cur.blocks.push({ type:'spacer' });
        i++; continue;
      }

      if (this.isChordLine(line)) {
        let ni = i + 1;
        while (ni < lines.length && lines[ni].trim() === '') ni++;
        const next = ni < lines.length ? lines[ni] : '';

        if (next && !next.match(/^\[/) && !this.isChordLine(next)) {
          cur.blocks.push({ type:'pair', chords: line, lyrics: next });
          i = ni + 1;
        } else {
          cur.blocks.push({ type:'chords-only', chords: line });
          i++;
        }
      } else {
        cur.blocks.push({ type:'lyrics', text: line });
        i++;
      }
    }
    if (cur) sections.push(cur);
    return sections.filter(s => s.label || s.blocks.length);
  }

  public isChordToken(t: string): boolean {
    return !!t && this.CHORD_PAT.test(t);
  }

  public isChordLine(line: string): boolean {
    const tokens = line.split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every(this.isChordToken.bind(this));
  }

  parseStructure(text: string): any[] {
    return text.split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(raw => {

        const secMatch = raw.match(/^(.+?)\s*\|\s*(.+)$/);
        let label = raw, note = '', reps = null;

        if (secMatch) {
          label = secMatch[1].trim();
          note = secMatch[2].trim();
        }

        const m = label.match(/^(.*?)\s*\(?[x×X]\s*(\d+)\)?\s*$/);
        if (m && m[1].trim()) {
          label = m[1].trim();
          reps = parseInt(m[2], 10);
        }

        return {
          label,
          note,
          reps,
          ci: this.colorOf(label),
          abbrev: this.abbrevOf(label)
        };
      });
  }

  public colorOf(label: string): number {
    const key = label.toLowerCase().replace(/\s*\d+\s*$/, '').trim();
    for (const [k, v] of Object.entries(this.SEC_COLOR)) {
      if (key === k || key.startsWith(k)) return v;
    }

    return Object.keys(this.SEC_COLOR).length % 7;
  }

  public abbrevOf(label: string): string {
    const key = label.toLowerCase().replace(/\s*\d+\s*$/, '').trim();
    const num = (label.match(/\d+$/) || [''])[0];
    for (const [k, v] of Object.entries(this.SEC_ABBREV)) {
      if (key === k || key.startsWith(k)) return v + num;
    }
    return label.slice(0, 2).toUpperCase() + num;
  }

  transposeNote(note: string, semis: number, pref: 'sharp' | 'flat' | null): string {

    let outArr;
    if (pref === 'sharp') outArr = this.CHROMATIC_SHARP;
    else if (pref === 'flat') outArr = this.CHROMATIC_FLAT;
    else outArr = note.includes('b') ? this.CHROMATIC_FLAT : this.CHROMATIC_SHARP;
    let i = this.CHROMATIC_SHARP.indexOf(note);
    if (i === -1) i = this.CHROMATIC_FLAT.indexOf(note);
    return i === -1 ? note : outArr[((i + semis) % 12 + 12) % 12];
  }

  transposeChord(chord: string, semis: number, pref: 'sharp' | 'flat' | null): string {
    const parts = chord.split('/');
    const tx = (s: string) => s.replace(/^([A-G][b#]?)(.*)$/, (_, r, suf) => this.transposeNote(r, semis, pref) + suf);
    return parts.map(tx).join('/');
  }

  semisFromKeys(from: string, to: string): number {
    const af = from.includes('b') ? this.CHROMATIC_FLAT : this.CHROMATIC_SHARP;
    const at = to.includes('b')   ? this.CHROMATIC_FLAT : this.CHROMATIC_SHARP;
    const fi = af.indexOf(from), ti = at.indexOf(to);
    if (fi < 0 || ti < 0) return 0;
    let d = ti - fi;
    if (d < -6) d += 12; if (d > 6) d -= 12;
    return d;
  }

  transposeLine(line: string, semis: number, pref: 'sharp' | 'flat' | null): string {

    let out = '';
    let lastEnd = 0;
    let carry = 0;
    const tokenRe = /\S+/g;
    let m;
    while ((m = tokenRe.exec(line)) !== null) {
      const token = m[0];
      const start = m.index;
      let ws = line.slice(lastEnd, start);
      if (ws.length) {
        const newLen = Math.max(1, ws.length - carry);
        ws = ' '.repeat(newLen);
        carry = 0;
      }
      out += ws;
      const newToken = (this.isChordToken(token) && token.length) ? this.transposeChord(token, semis, pref) : token;
      out += newToken;
      carry += newToken.length - token.length;
      lastEnd = start + token.length;
    }
    out += line.slice(lastEnd);
    return out;
  }

  transposeText(text: string, semis: number, pref: 'sharp' | 'flat' | null): string {
    if (!semis) return text;
    return text.split('\n').map(line => {
      if (line.match(/^\[/)) return line;
      if (!this.isChordLine(line)) return line;
      return this.transposeLine(line, semis, pref);
    }).join('\n');
  }
}