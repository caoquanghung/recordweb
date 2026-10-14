export function clampAudioGain(gain: number): number {
  return Math.max(0, Math.min(2, gain));
}

export function disconnectAudioNodes(...nodes: Array<AudioNode | null>): void {
  nodes.forEach((node) => {
    try {
      node?.disconnect();
    } catch {
      // A partially initialized graph may already be disconnected.
    }
  });
}

export function readAnalyserRmsDb(
  analyser: AnalyserNode,
  samples: Uint8Array<ArrayBuffer>,
): number {
  analyser.getByteTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }

  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}
