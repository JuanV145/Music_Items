import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MetronomeService {
  private audioContext: AudioContext | null = null;
  private intervalId: any = null;

  isPlaying = signal(false);
  volume = signal(0.7);

  start(tempo: number) {
    if (this.isPlaying() || tempo <= 0 || tempo > 300) return;

    this.isPlaying.set(true);
    const interval = 60000 / tempo;

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    this.playTick();
    this.intervalId = setInterval(() => this.playTick(), interval);
  }

  stop() {
    this.isPlaying.set(false);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.audioContext?.state === 'running') {
      this.audioContext.suspend();
    }
  }

  private playTick() {
    if (!this.isPlaying() || !this.audioContext) return;

    try {
      const oscillator = this.audioContext!.createOscillator();
      const gainNode = this.audioContext!.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1000, this.audioContext!.currentTime); // 1000 Hz
      gainNode.gain.setValueAtTime(0.15 * this.volume(), this.audioContext!.currentTime); // Volume

      gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext!.currentTime + 0.05);

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext!.destination);

      oscillator.start();
      oscillator.stop(this.audioContext!.currentTime + 0.05);
    } catch (e) {
      console.error('Error playing tick:', e);
      this.tryPlayNoiseClick();
    }
  }

  private tryPlayNoiseClick() {
    if (!this.isPlaying() || !this.audioContext) return;

    try {
      const bufferSize = this.audioContext.sampleRate * 0.1;
      const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      for (let i = 0; i < bufferSize; i++) {
        const envelope = Math.exp(-i / (bufferSize * 0.1)); // Quick decay
        data[i] *= envelope;
      }

      const noiseSource = this.audioContext.createBufferSource();
      noiseSource.buffer = buffer;
      const noiseGain = this.audioContext.createGain();
      noiseGain.gain.setValueAtTime(0.2 * this.volume(), this.audioContext.currentTime);

      noiseSource.connect(noiseGain);
      noiseGain.connect(this.audioContext.destination);

      noiseSource.start();
      noiseSource.stop(this.audioContext.currentTime + 0.1);
    } catch (e) {
      console.error('Error playing noise click:', e);
    }
  }

  setVolume(volume: number) {
    this.volume.set(Math.max(0, Math.min(1, volume)));
  }
}