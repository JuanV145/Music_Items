import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MetronomeService {
  private audioContext: AudioContext | null = null;
  private intervalId: any = null;

  isPlaying = signal(false);
  volume = signal(1.0); // default max volume
  beatsPerMeasure = signal(4);
  subdivisionsPerBeat = signal(2); // 2=eighth notes (Corchea)
  accentBeats = signal(new Set<number>([1])); // 1-based indices of accented beats; default: first beat accented
  currentBeat = signal(0);
  activeSubdivision = signal(1); // 1-based subdivision currently being played (for visual feedback)

  start(tempo: number) {
    if (this.isPlaying() || tempo <= 0 || tempo > 300) return;

    this.isPlaying.set(true);
    this.currentBeat.set(0); // Reset subdivision counter
    this.activeSubdivision.set(1); // Reset visual feedback to first subdivision
    const interval = (60000 / tempo) / this.subdivisionsPerBeat();

    if (!this.audioContext || this.audioContext.state === 'closed') {
      // Create a new audio context if none exists or if it was closed
      this.audioContext = new AudioContext();
      this.audioContext.resume().then(() => {
        this.playTick();
        this.intervalId = setInterval(() => this.playTick(), interval);
      });
    } else if (this.audioContext.state === 'suspended') {
      // Resume the audio context if it was suspended
      this.audioContext.resume().then(() => {
        this.playTick();
        this.intervalId = setInterval(() => this.playTick(), interval);
      });
    } else {
      // Context is already running
      this.playTick();
      this.intervalId = setInterval(() => this.playTick(), interval);
    }
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

    // Update visual feedback for the subdivision we are about to play
    this.activeSubdivision.set(this.currentBeat() + 1);

    try {
      const oscillator = this.audioContext!.createOscillator();
      const gainNode = this.audioContext!.createGain();

      // Read current subdivision for THIS tick's calculations
      const currentSubdivision = this.currentBeat() + 1; // Convert 0-based to 1-based

      // Calculate which beat and subdivision we're on for THIS tick
      const totalSubdivisionsPerMeasure = this.beatsPerMeasure() * this.subdivisionsPerBeat();
      const beatNumber = Math.floor((currentSubdivision - 1) / this.subdivisionsPerBeat()) + 1;
      const subdivisionInBeat = ((currentSubdivision - 1) % this.subdivisionsPerBeat()) + 1;

      // Calculate NEXT subdivision for wrapping logic
      let nextSubdivision = currentSubdivision + 1;
      let nextBeatNumber = beatNumber;
      let nextSubdivisionInBeat = subdivisionInBeat;

      if (nextSubdivision > totalSubdivisionsPerMeasure) {
        // Wrap to beginning
        nextSubdivision = 1;
        nextBeatNumber = 1;
        nextSubdivisionInBeat = 1;
      }

      // Determine if this is an accented downbeat (accent on beat boundaries, not subdivisions)
      let isAccented = false;
      let isDownbeat = false;
      if (subdivisionInBeat === 1) { // First subdivision of the beat
        isDownbeat = true;
        if (this.accentBeats().has(beatNumber)) {
          isAccented = true;
        }
      }

      // For accented beats: higher frequency and louder
      // For downbeats: medium frequency and volume
      // For other subdivisions: lower frequency and volume
      let frequency = 800; // Default soft subdivision
      let volumeMultiplier = 0.3; // Default soft subdivision

      if (isAccented) {
        frequency = 1400; // Accented beat: 1400 Hz
        volumeMultiplier = 1.5; // Accented: 50% louder
      } else if (isDownbeat) {
        frequency = 1100; // Downbeat: 1100 Hz
        volumeMultiplier = 0.8; // Downbeat: medium volume
      }
      // else: keep default values for soft subdivisions

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, this.audioContext!.currentTime);

      // Clamp volume to prevent exceeding 1.0
      const finalVolume = Math.min(1.0, 0.4 * this.volume() * volumeMultiplier);
      gainNode.gain.setValueAtTime(finalVolume, this.audioContext!.currentTime); // Volume

      gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext!.currentTime + 0.05);

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext!.destination);

      oscillator.start();
      oscillator.stop(this.audioContext!.currentTime + 0.05);

      // UPDATE currentBeat for the NEXT tick
      this.currentBeat.set(nextSubdivision - 1); // Convert back to 0-based for storage
    } catch (e) {
      console.error('Error playing tick:', e);
      this.tryPlayNoiseClick();
    }
  }

  private tryPlayNoiseClick() {
    if (!this.isPlaying() || !this.audioContext) return;

    // Update visual feedback for the subdivision we are about to play
    this.activeSubdivision.set(this.currentBeat() + 1);

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

      // Read current subdivision for THIS tick's calculations
      const currentSubdivision = this.currentBeat() + 1; // Convert 0-based to 1-based

      // Calculate which beat and subdivision we're on for THIS tick
      const totalSubdivisionsPerMeasure = this.beatsPerMeasure() * this.subdivisionsPerBeat();
      const beatNumber = Math.floor((currentSubdivision - 1) / this.subdivisionsPerBeat()) + 1;
      const subdivisionInBeat = ((currentSubdivision - 1) % this.subdivisionsPerBeat()) + 1;

      // Calculate NEXT subdivision for wrapping logic
      let nextSubdivision = currentSubdivision + 1;
      let nextBeatNumber = beatNumber;
      let nextSubdivisionInBeat = subdivisionInBeat;

      if (nextSubdivision > totalSubdivisionsPerMeasure) {
        // Wrap to beginning
        nextSubdivision = 1;
        nextBeatNumber = 1;
        nextSubdivisionInBeat = 1;
      }

      // Determine if this is an accented downbeat (accent on beat boundaries, not subdivisions)
      let isAccented = false;
      let isDownbeat = false;
      if (subdivisionInBeat === 1) { // First subdivision of the beat
        isDownbeat = true;
        if (this.accentBeats().has(beatNumber)) {
          isAccented = true;
        }
      }

      // For accented beats: higher frequency and louder
      // For downbeats: medium frequency and volume
      // For other subdivisions: lower frequency and volume
      let volumeMultiplier = 0.3; // Default soft subdivision

      if (isAccented) {
        volumeMultiplier = 1.5; // Accented: 50% louder
      } else if (isDownbeat) {
        volumeMultiplier = 0.8; // Downbeat: medium volume
      }
      // Note: For noise, we don't change frequency since it's noise, but we still change volume
      const finalVolume = Math.min(1.0, 0.5 * this.volume() * volumeMultiplier);
      noiseGain.gain.setValueAtTime(finalVolume, this.audioContext.currentTime);

      noiseSource.connect(noiseGain);
      noiseGain.connect(this.audioContext.destination);

      noiseSource.start();
      noiseSource.stop(this.audioContext.currentTime + 0.1);

      // UPDATE currentBeat for the NEXT tick
      this.currentBeat.set(nextSubdivision - 1); // Convert back to 0-based for storage
    } catch (e) {
      console.error('Error playing noise click:', e);
    }
  }

  /** Toggle whether a beat is accented (1-based) */
  toggleAccentBeat(beat: number) {
    this.accentBeats.update(beats => {
      const newSet = new Set(beats);
      if (newSet.has(beat)) {
        newSet.delete(beat);
      } else {
        newSet.add(beat);
      }
      return newSet;
    });
  }

  /** Set accent beats to only the given beat (1-based), clearing others */
  setAccentBeatOnly(beat: number) {
    this.accentBeats.set(new Set<number>([beat]));
  }

  setVolume(volume: number) {
    this.volume.set(Math.max(0, Math.min(1, volume)));
  }

  setSubdivisionsPerBeat(subdivisions: number) {
    this.subdivisionsPerBeat.set(Math.max(1, Math.min(16, subdivisions))); // Limit between 1 and 16
  }
}