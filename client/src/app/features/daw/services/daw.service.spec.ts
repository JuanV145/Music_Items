import { configureMasterCompressor } from './daw.service';

describe('configureMasterCompressor', () => {
  it('uses shared peak-control settings for live and offline audio contexts', () => {
    const compressor = {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 }
    } as unknown as DynamicsCompressorNode;
    const context = {
      createDynamicsCompressor: () => compressor
    } as unknown as BaseAudioContext;

    const configured = configureMasterCompressor(context);

    expect(configured).toBe(compressor);
    expect(compressor.threshold.value).toBe(-3);
    expect(compressor.knee.value).toBe(0);
    expect(compressor.ratio.value).toBe(20);
    expect(compressor.attack.value).toBe(0.003);
    expect(compressor.release.value).toBe(0.12);
  });
});
