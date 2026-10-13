import { Component } from '@angular/core';
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
    return this.metronome.volume();
  }

  set metronomeVolume(value: number) {
    this.metronome.setVolume(value);
  }

  get isMetronomePlaying(): boolean {
    return this.metronome.isPlaying();
  }

  tempo: number = 72;

  private tempoChangeTimeout: any = null;

  constructor(public metronome: MetronomeService) { }

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
}