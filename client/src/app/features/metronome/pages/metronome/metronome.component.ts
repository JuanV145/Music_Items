import { Component, AfterViewInit, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MetronomeService } from '../../../../core/metronome/metronome.service';

@Component({
  selector: 'app-metronomo',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './metronome.component.html',
  styleUrls: ['./metronome.component.scss']
})
export class MetronomeComponent {

  get metronomeVolume(): number {
    return this.metronome.volume() * 100;
  }

  set metronomeVolume(value: number) {
    this.metronome.setVolume(value / 100);
  }

  get subdivisionsPerBeat(): number {
    return this.metronome.subdivisionsPerBeat();
  }

  set subdivisionsPerBeat(value: number) {
    this.metronome.setSubdivisionsPerBeat(value);
  }

  get isMetronomePlaying(): boolean {
    return this.metronome.isPlaying();
  }

  tempo: number = 72;

  private tempoChangeTimeout: any = null;

  constructor(public metronome: MetronomeService) { }

  ngAfterViewInit(): void {
    // No scroll offset needed anymore
  }


  toggleMetronome(): void {
    if (this.metronome.isPlaying()) {
      this.metronome.stop();
    } else {
      this.metronome.start(this.tempo);
    }
  }

  onTempoChange(): void {

    if (this.tempoChangeTimeout) {
      clearTimeout(this.tempoChangeTimeout);
    }

    this.tempoChangeTimeout = setTimeout(() => {
      if (this.metronome.isPlaying()) {
        this.metronome.stop();
        this.metronome.start(this.tempo);
      }
    }, 500);
  }

  onBeatsPerMeasureChange(): void {
    // When beats per measure changes, we may need to adjust accent beats
    // Remove any accent beats that are now out of range
    this.metronome.accentBeats.update(beats => {
      const validBeats = new Set<number>();
      const maxBeat = this.beatsPerMeasure;
      for (const beat of beats) {
        if (beat >= 1 && beat <= maxBeat) {
          validBeats.add(beat);
        }
      }
      return validBeats;
    });
  }

  onSubdivisionsChange(): void {
    // When subdivisions change, restart the metronome if playing to apply new interval
    if (this.metronome.isPlaying()) {
      const tempo = this.tempo;
      this.metronome.stop();
      this.metronome.start(tempo);
    }
  }

  get beatsPerMeasure(): number {
    return this.metronome.beatsPerMeasure();
  }

  set beatsPerMeasure(value: number) {
    this.metronome.beatsPerMeasure.set(Math.max(1, Math.min(12, value)));
  }

  get beatsArray(): number[] {
    return Array.from({length: this.beatsPerMeasure}, (_, i) => i + 1);
  }

  get currentBeat(): number {
    return this.metronome.currentBeat();
  }

  get totalSubdivisionsPerMeasure(): number {
    return this.beatsPerMeasure * this.subdivisionsPerBeat;
  }

  get subdivisionsArray(): number[] {
    return Array.from({length: this.totalSubdivisionsPerMeasure}, (_, i) => i + 1);
  }

  get currentSubdivision(): number {
    return this.metronome.activeSubdivision();
  }

  getCurrentBeatNumber(): number {
    // Returns which beat (1-based) we're currently on
    return Math.floor((this.currentSubdivision - 1) / this.subdivisionsPerBeat) + 1;
  }

  getSubdivisionInBeat(): number {
    // Returns which subdivision within the current beat we're on (1-based)
    return ((this.currentSubdivision - 1) % this.subdivisionsPerBeat) + 1;
  }

  getSubdivisionDisplay(subdivision: number): string {
    const beatNumber = Math.floor((subdivision - 1) / this.subdivisionsPerBeat) + 1;
    const subdivisionInBeat = ((subdivision - 1) % this.subdivisionsPerBeat) + 1;

    return subdivisionInBeat === 1
      ? beatNumber.toString()
      : `${beatNumber}.${subdivisionInBeat}`;
  }

  /** Returns the beat number (1-based) for a given subdivision */
  getBeatNumberForSubdivision(subdivision: number): number {
    return Math.floor((subdivision - 1) / this.subdivisionsPerBeat) + 1;
  }
}