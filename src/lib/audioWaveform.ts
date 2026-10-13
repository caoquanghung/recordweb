export const RECORDED_WAVEFORM_PEAK_COUNT = 120;

export function isRecordedWaveformPeaks(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === RECORDED_WAVEFORM_PEAK_COUNT
    && value.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1);
}

export function getRecordedWaveformPeaks(buffer: AudioBuffer, peakCount = RECORDED_WAVEFORM_PEAK_COUNT) {
  const peaks = Array.from({ length: peakCount }, () => 0);
  const channelCount = buffer.numberOfChannels;
  const samplesPerPeak = Math.max(1, Math.floor(buffer.length / peakCount));

  for (let peakIndex = 0; peakIndex < peakCount; peakIndex += 1) {
    const start = peakIndex * samplesPerPeak;
    const end = peakIndex === peakCount - 1
      ? buffer.length
      : Math.min(buffer.length, start + samplesPerPeak);
    const sampleStride = Math.max(1, Math.floor((end - start) / 512));
    let peak = 0;

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const samples = buffer.getChannelData(channelIndex);
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += sampleStride) {
        peak = Math.max(peak, Math.abs(samples[sampleIndex]));
      }
    }
    peaks[peakIndex] = peak;
  }

  const maximum = Math.max(...peaks, 0.0001);
  return peaks.map((peak) => Math.sqrt(peak / maximum));
}

export async function decodeRecordedWaveform(blob: Blob) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return {
      durationSeconds: decoded.duration,
      peaks: getRecordedWaveformPeaks(decoded),
    };
  } finally {
    if (context.state !== 'closed') await context.close().catch(() => undefined);
  }
}
