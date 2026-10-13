import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TransposeService {
  private CHROMATIC_SHARP = [
    'C', 'C#', 'D', 'D#', 'E', 'F',
    'F#', 'G', 'G#', 'A', 'A#', 'B'
  ];

  private CHROMATIC_FLAT = [
    'C', 'Db', 'D', 'Eb', 'E', 'F',
    'Gb', 'G', 'Ab', 'A', 'Bb', 'B'
  ];

  constructor() { }

  getKeyOptions(pref: null | 'sharp' | 'flat'): string[] {
    if (pref === 'sharp') {
      return [...this.CHROMATIC_SHARP];
    }

    if (pref === 'flat') {
      return [...this.CHROMATIC_FLAT];
    }

    return [
      'C', 'Db', 'D', 'Eb', 'E', 'F',
      'F#', 'G', 'Ab', 'A', 'Bb', 'B'
    ];
  }

  getDefaultAccidentalPref(
    key: string
  ): null | 'sharp' | 'flat' {
    if (key.includes('b')) {
      return 'flat';
    }

    if (key.includes('#')) {
      return 'sharp';
    }

    return null;
  }

  transposeNote(
    note: string,
    semis: number,
    pref: null | 'sharp' | 'flat'
  ): string {
    const outputArray =
      pref === 'sharp'
        ? this.CHROMATIC_SHARP
        : pref === 'flat'
          ? this.CHROMATIC_FLAT
          : note.includes('b')
            ? this.CHROMATIC_FLAT
            : this.CHROMATIC_SHARP;

    let index = this.CHROMATIC_SHARP.indexOf(note);

    if (index === -1) {
      index = this.CHROMATIC_FLAT.indexOf(note);
    }

    if (index === -1) {
      return note;
    }

    return outputArray[
      ((index + semis) % 12 + 12) % 12
    ];
  }

  transposeChord(
    chord: string,
    semis: number,
    pref: null | 'sharp' | 'flat'
  ): string {
    const parts = chord.split('/');

    const transposeRoot = (value: string): string =>
      value.replace(
        /^([A-G][b#]?)(.*)$/,
        (_match: string, root: string, suffix: string) =>
          this.transposeNote(root, semis, pref) + suffix
      );

    return parts.map(transposeRoot).join('/');
  }

  semisFromKeys(from: string, to: string): number {
    const fromArray = from.includes('b')
      ? this.CHROMATIC_FLAT
      : this.CHROMATIC_SHARP;

    const toArray = to.includes('b')
      ? this.CHROMATIC_FLAT
      : this.CHROMATIC_SHARP;

    const fromIndex = fromArray.indexOf(from);
    const toIndex = toArray.indexOf(to);

    if (fromIndex < 0 || toIndex < 0) {
      return 0;
    }

    let distance = toIndex - fromIndex;

    if (distance < -6) {
      distance += 12;
    }

    if (distance > 6) {
      distance -= 12;
    }

    return distance;
  }

  transposeLine(
    line: string,
    semis: number,
    pref: null | 'sharp' | 'flat'
  ): string {
    let output = '';
    let lastEnd = 0;
    let carry = 0;

    const tokenRegex = /\S+/g;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(line)) !== null) {
      const token = match[0];
      const start = match.index;

      let whitespace = line.slice(lastEnd, start);

      if (whitespace.length) {
        const newLength = Math.max(
          1,
          whitespace.length - carry
        );

        whitespace = ' '.repeat(newLength);
        carry = 0;
      }

      output += whitespace;

      const newToken =
        this.isChordToken(token)
          ? this.transposeChord(token, semis, pref)
          : token;

      output += newToken;

      carry += newToken.length - token.length;
      lastEnd = start + token.length;
    }

    output += line.slice(lastEnd);

    return output;
  }

  transposeText(
    text: string,
    semis: number,
    pref: null | 'sharp' | 'flat'
  ): string {
    if (!semis) {
      return text;
    }

    return text
      .split('\n')
      .map((line: string) => {
        if (line.match(/^\[/)) {
          return line;
        }

        if (!this.isChordLine(line)) {
          return line;
        }

        return this.transposeLine(line, semis, pref);
      })
      .join('\n');
  }

  private isChordToken(token: string): boolean {
    const chordPattern =
      /^[A-G][b#]?((maj|min|m|M)\d*|dim7?|aug|sus[24]?|add\d+|[+\-°ø]|\d+|6\/9|\([^)]*\)|[b#](5|9|11|13)|\/[A-G][b#]?)*$/;

    return !!token && chordPattern.test(token);
  }

  private isChordLine(line: string): boolean {
    const tokens = line
      .split(/\s+/)
      .filter(Boolean);

    return (
      tokens.length > 0 &&
      tokens.every(token => this.isChordToken(token))
    );
  }
}