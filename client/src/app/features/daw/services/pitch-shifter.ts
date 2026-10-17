import { PitchMode, PitchQuality, clamp } from '../models/daw.models';

export interface PitchShiftOptions {
  mode: PitchMode;
  quality: PitchQuality;
  /** Se consulta con frecuencia; devuelve true si el trabajo debe abortarse. */
  isCancelled: () => boolean;
  onProgress?: (fraction: number) => void;
}

const yieldToBrowser = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * Pitch shifting que preserva la duración.
 *  - WSOLA (dominio temporal) para voces/material no tonal y cambios pequeños (<= 3 st).
 *  - Vocoder de fase con "identity phase locking" para pistas polifónicas o cambios grandes.
 * No depende de Angular: se puede probar de forma aislada.
 */
export class PitchShifter {
  constructor(private readonly context: BaseAudioContext) {}

  /** Heurística por nombre de pista. */
  static detectMode(name: string): PitchMode {
    const label = name.trim();
    if (/(^|\b)(voz|voces|voice|vocal|vocals|vox|tenor|tenores|alto|altos|soprano|sopranos|bar[ií]tono|baritones|guide)(\b|$)/i.test(label)) {
      return 'voice';
    }
    if (/(^|\b)(piano\s*\d*|keys?\s*\d*|keyboards?\s*\d*|guitars?\s*\d*|gtr\s*\d*|eg\s*\d*|electric|acoustic|pads?\s*\d*|organs?\s*\d*|strings?\s*\d*|chords?\s*\d*|rhodes|epiano|synth|loop|fx|bgvs?|backing\s*vox(?:als?)?)(\b|$)/i.test(label)) {
      return 'polyphonic';
    }
    return 'fast';
  }

  async shift(buffer: AudioBuffer, semitones: number, options: PitchShiftOptions): Promise<AudioBuffer | null> {
    if (semitones === 0) return buffer;
    if (options.mode !== 'polyphonic' && Math.abs(semitones) <= 3) {
      return this.shiftWsola(buffer, semitones, options);
    }
    return this.shiftPhaseVocoder(buffer, semitones, options);
  }

  // ───────────────────────── Vocoder de fase ─────────────────────────

  private async shiftPhaseVocoder(buffer: AudioBuffer, semitones: number, options: PitchShiftOptions): Promise<AudioBuffer | null> {
    const { isCancelled, onProgress, quality } = options;
    const factor = Math.pow(2, semitones / 12);
    const targetLength = buffer.length;
    // Etapa 1: remuestreo virtual (cambia el pitch y la duración intermedia).
    // Etapa 2: el vocoder restaura la duración original.
    const intermediateLength = Math.max(1, Math.round(targetLength / factor));
    const sourcePeak = PitchShifter.peakOf(buffer);

    const stretchRatio = targetLength / intermediateLength;
    const fftSize = quality === 'Fast' ? 4096 : 8192;
    const halfSize = fftSize / 2;
    const maxSynthesisHop = fftSize / 2;
    const synthesisHop = Math.max(512, Math.min(maxSynthesisHop, Math.round(maxSynthesisHop * Math.min(1, stretchRatio))));
    const hann = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));

    const outputStarts: number[] = [];
    for (let start = -halfSize; start < targetLength; start += synthesisHop) outputStarts.push(start);
    const weights = new Float32Array(targetLength);
    for (const frameStart of outputStarts) {
      for (let i = 0; i < fftSize; i++) {
        const outputIndex = frameStart + i;
        if (outputIndex >= 0 && outputIndex < targetLength) weights[outputIndex] += hann[i] * hann[i];
      }
    }

    const output = this.context.createBuffer(buffer.numberOfChannels, targetLength, buffer.sampleRate);
    const omega = new Float64Array(halfSize + 1);
    for (let bin = 0; bin <= halfSize; bin++) omega[bin] = (2 * Math.PI * bin) / fftSize;
    let outputPeak = 0;

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const input = buffer.getChannelData(channel);
      const sums = new Float32Array(targetLength);
      const real = new Float64Array(fftSize);
      const imag = new Float64Array(fftSize);
      const spectrumReal = new Float64Array(fftSize);
      const spectrumImag = new Float64Array(fftSize);
      const previousPhase = new Float64Array(halfSize + 1);
      const phaseAccumulator = new Float64Array(halfSize + 1);
      const currentPhase = new Float64Array(halfSize + 1);
      const magnitudes = new Float64Array(halfSize + 1);
      let previousInputStart: number | null = null;

      for (let frameIndex = 0; frameIndex < outputStarts.length; frameIndex++) {
        if (isCancelled()) return null;
        const outputStart = outputStarts[frameIndex];
        const inputStart = Math.round(outputStart / stretchRatio);
        real.fill(0);
        imag.fill(0);
        spectrumReal.fill(0);
        spectrumImag.fill(0);
        for (let i = 0; i < fftSize; i++) {
          const sourceIndex = inputStart + i;
          if (sourceIndex >= 0 && sourceIndex < intermediateLength) {
            const sourcePosition = Math.min(buffer.length - 1, sourceIndex * factor);
            const lower = Math.floor(sourcePosition);
            const upper = Math.min(buffer.length - 1, lower + 1);
            const fraction = sourcePosition - lower;
            real[i] = (input[lower] * (1 - fraction) + input[upper] * fraction) * hann[i];
          }
        }
        PitchShifter.fft(real, imag, false);

        const analysisHop = previousInputStart === null ? 0 : inputStart - previousInputStart;
        let framePeakMagnitude = 0;
        let framePeakBin = 0;
        for (let bin = 0; bin <= halfSize; bin++) {
          const phase = Math.atan2(imag[bin], real[bin]);
          currentPhase[bin] = phase;
          const magnitude = Math.hypot(real[bin], imag[bin]);
          magnitudes[bin] = magnitude;
          if (magnitude > framePeakMagnitude) {
            framePeakMagnitude = magnitude;
            framePeakBin = bin;
          }
          if (previousInputStart === null) {
            phaseAccumulator[bin] = phase;
          } else {
            const expectedAdvance = omega[bin] * analysisHop;
            const delta = PitchShifter.wrapPhase(phase - previousPhase[bin] - expectedAdvance);
            const advancePerSample = (expectedAdvance + delta) / Math.max(1, analysisHop);
            phaseAccumulator[bin] += advancePerSample * synthesisHop;
          }
          previousPhase[bin] = phase;
        }
        previousInputStart = inputStart;

        // Identity phase locking: cada bin conserva su fase relativa respecto al pico más cercano.
        const peakBins: number[] = [];
        const peakThreshold = framePeakMagnitude * 0.0025;
        for (let bin = 1; bin < halfSize; bin++) {
          if (magnitudes[bin] >= peakThreshold &&
              magnitudes[bin] >= magnitudes[bin - 1] &&
              magnitudes[bin] > magnitudes[bin + 1]) {
            peakBins.push(bin);
          }
        }
        if (peakBins.length === 0) peakBins.push(framePeakBin);

        let nearestPeakIndex = 0;
        for (let bin = 0; bin <= halfSize; bin++) {
          while (nearestPeakIndex + 1 < peakBins.length &&
                 Math.abs(peakBins[nearestPeakIndex + 1] - bin) < Math.abs(peakBins[nearestPeakIndex] - bin)) {
            nearestPeakIndex++;
          }
          const peakBin = peakBins[nearestPeakIndex];
          if (bin !== peakBin) {
            const relativePhase = PitchShifter.wrapPhase(currentPhase[bin] - currentPhase[peakBin]);
            phaseAccumulator[bin] = phaseAccumulator[peakBin] + relativePhase;
          }
          spectrumReal[bin] = magnitudes[bin] * Math.cos(phaseAccumulator[bin]);
          spectrumImag[bin] = magnitudes[bin] * Math.sin(phaseAccumulator[bin]);
        }

        // Simetría hermítica para la mitad negativa del espectro.
        spectrumImag[0] = 0;
        spectrumImag[halfSize] = 0;
        for (let bin = 1; bin < halfSize; bin++) {
          spectrumReal[fftSize - bin] = spectrumReal[bin];
          spectrumImag[fftSize - bin] = -spectrumImag[bin];
        }
        PitchShifter.fft(spectrumReal, spectrumImag, true);
        for (let i = 0; i < fftSize; i++) {
          const outputIndex = outputStart + i;
          if (outputIndex >= 0 && outputIndex < targetLength) sums[outputIndex] += spectrumReal[i] * hann[i];
        }

        if (frameIndex % 64 === 0) {
          const completed = channel * outputStarts.length + frameIndex + 1;
          onProgress?.(completed / (outputStarts.length * buffer.numberOfChannels));
        }
        if (frameIndex % 32 === 31) {
          await yieldToBrowser();
          if (isCancelled()) return null;
        }
      }

      const channelOutput = output.getChannelData(channel);
      for (let i = 0; i < targetLength; i++) {
        channelOutput[i] = weights[i] > 1e-8 ? sums[i] / weights[i] : 0;
        outputPeak = Math.max(outputPeak, Math.abs(channelOutput[i]));
      }
    }

    PitchShifter.limitToSourcePeak(output, sourcePeak, outputPeak);
    onProgress?.(1);
    return output;
  }

  // ───────────────────────────── WSOLA ─────────────────────────────

  private async shiftWsola(buffer: AudioBuffer, semitones: number, options: PitchShiftOptions): Promise<AudioBuffer | null> {
    const { isCancelled, onProgress, quality } = options;
    const factor = Math.pow(2, semitones / 12);
    const targetLength = buffer.length;
    const intermediateLength = Math.max(1, Math.round(targetLength / factor));
    const stretchRatio = targetLength / intermediateLength;

    const desiredGrain = quality === 'Fast'
      ? clamp(Math.round(buffer.sampleRate * 0.045), 1024, 4096)
      : clamp(Math.round(buffer.sampleRate * 0.09), 1024, 8192);
    const grainSize = 2 ** Math.round(Math.log2(desiredGrain));
    const overlapSize = Math.max(128, Math.min(Math.floor(grainSize * 0.38), Math.round(buffer.sampleRate * 0.015)));
    const baseAnalysisHop = grainSize - overlapSize;
    const synthesisHop = clamp(
      Math.round(baseAnalysisHop * stretchRatio),
      Math.max(64, Math.floor(grainSize * 0.45)),
      grainSize - 64
    );
    const frameCount = Math.ceil(targetLength / synthesisHop);
    const searchRadius = Math.max(24, Math.min(Math.round(buffer.sampleRate * 0.005), Math.floor((grainSize - synthesisHop) * 0.5)));
    const searchStep = 8;

    const hann = new Float32Array(grainSize);
    for (let i = 0; i < grainSize; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grainSize - 1));

    const sourceChannels: Float32Array[] = [];
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) sourceChannels.push(buffer.getChannelData(channel));
    const output = this.context.createBuffer(buffer.numberOfChannels, targetLength, buffer.sampleRate);
    const outputChannels: Float32Array[] = [];
    for (let channel = 0; channel < output.numberOfChannels; channel++) outputChannels.push(output.getChannelData(channel));
    const weights = new Float32Array(targetLength);
    const sourcePeak = PitchShifter.peakOf(buffer);

    // Remuestreo virtual (interpolación lineal) sin reservar otro AudioBuffer.
    const readResampled = (channel: number, intermediateIndex: number): number => {
      if (intermediateIndex < 0 || intermediateIndex >= intermediateLength) return 0;
      const sourcePosition = intermediateIndex * factor;
      const lower = Math.min(buffer.length - 1, Math.floor(sourcePosition));
      const upper = Math.min(buffer.length - 1, lower + 1);
      const fraction = sourcePosition - lower;
      const data = sourceChannels[channel];
      return data[lower] * (1 - fraction) + data[upper] * fraction;
    };

    for (let frameIndex = 0, outputStart = 0; outputStart < targetLength; frameIndex++, outputStart += synthesisHop) {
      if (isCancelled()) return null;

      // El inicio esperado se deriva de la posición de salida del frame (sin acumular hops).
      const expectedInputStart = Math.round(outputStart / stretchRatio);
      let bestInputStart = expectedInputStart;
      let bestScore = -Infinity;
      const overlapLength = Math.min(grainSize - synthesisHop, targetLength - outputStart);
      const correlationStride = Math.max(8, Math.floor(Math.max(1, overlapLength) / 32));

      if (frameIndex > 0 && overlapLength >= 96) {
        for (let offset = -searchRadius; offset <= searchRadius; offset += searchStep) {
          const candidateStart = expectedInputStart + offset;
          let correlation = 0;
          let previousEnergy = 0;
          let candidateEnergy = 0;
          let sampleCount = 0;
          for (let i = 0; i < overlapLength; i += correlationStride) {
            const outputIndex = outputStart + i;
            const weight = weights[outputIndex];
            if (weight <= 1e-7) continue;
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
              const previousSample = outputChannels[channel][outputIndex] / weight;
              const candidateSample = readResampled(channel, candidateStart + i);
              correlation += previousSample * candidateSample;
              previousEnergy += previousSample * previousSample;
              candidateEnergy += candidateSample * candidateSample;
            }
            sampleCount++;
          }
          if (sampleCount > 0 && previousEnergy > 1e-9 && candidateEnergy > 1e-9) {
            const score = correlation / Math.sqrt(previousEnergy * candidateEnergy);
            if (score > bestScore) {
              bestScore = score;
              bestInputStart = candidateStart;
            }
          }
        }
      }

      const frameValidEnd = Math.min(grainSize, targetLength - outputStart);
      for (let i = 0; i < frameValidEnd; i++) {
        const outputIndex = outputStart + i;
        const windowValue = hann[i];
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          outputChannels[channel][outputIndex] += readResampled(channel, bestInputStart + i) * windowValue;
        }
        weights[outputIndex] += windowValue;
      }

      if (frameIndex % 16 === 0 || frameIndex === frameCount - 1) {
        onProgress?.(Math.min(0.99, (frameIndex + 1) / frameCount));
      }
      if (frameIndex % 32 === 31) {
        await yieldToBrowser();
        if (isCancelled()) return null;
      }
    }

    let outputPeak = 0;
    for (const data of outputChannels) {
      for (let i = 0; i < targetLength; i++) {
        data[i] = weights[i] > 1e-7 ? data[i] / weights[i] : 0;
        outputPeak = Math.max(outputPeak, Math.abs(data[i]));
      }
    }
    PitchShifter.limitToSourcePeak(output, sourcePeak, outputPeak);
    onProgress?.(1);
    return output;
  }

  // ───────────────────────────── Utilidades ─────────────────────────────

  private static peakOf(buffer: AudioBuffer): number {
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    }
    return peak;
  }

  /** Evita crear clipping nuevo; nunca amplifica audio más silencioso que la fuente. */
  private static limitToSourcePeak(output: AudioBuffer, sourcePeak: number, outputPeak: number): void {
    if (sourcePeak <= 0 || outputPeak <= sourcePeak) return;
    const attenuation = sourcePeak / outputPeak;
    for (let channel = 0; channel < output.numberOfChannels; channel++) {
      const data = output.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] *= attenuation;
    }
  }

  private static wrapPhase(value: number): number {
    return ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  }

  /** FFT radix-2 in-place. La inversa se normaliza por la longitud. */
  private static fft(real: Float64Array, imag: Float64Array, inverse: boolean): void {
    const size = real.length;
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }
    for (let length = 2; length <= size; length <<= 1) {
      const angle = (inverse ? 2 : -2) * Math.PI / length;
      const rootReal = Math.cos(angle);
      const rootImag = Math.sin(angle);
      const halfLength = length >> 1;
      for (let start = 0; start < size; start += length) {
        let twiddleReal = 1;
        let twiddleImag = 0;
        for (let offset = 0; offset < halfLength; offset++) {
          const even = start + offset;
          const odd = even + halfLength;
          const oddReal = real[odd] * twiddleReal - imag[odd] * twiddleImag;
          const oddImag = real[odd] * twiddleImag + imag[odd] * twiddleReal;
          const evenReal = real[even];
          const evenImag = imag[even];
          real[even] = evenReal + oddReal;
          imag[even] = evenImag + oddImag;
          real[odd] = evenReal - oddReal;
          imag[odd] = evenImag - oddImag;
          const nextTwiddleReal = twiddleReal * rootReal - twiddleImag * rootImag;
          twiddleImag = twiddleReal * rootImag + twiddleImag * rootReal;
          twiddleReal = nextTwiddleReal;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < size; i++) {
        real[i] /= size;
        imag[i] /= size;
      }
    }
  }
}