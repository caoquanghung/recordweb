import { clampAudioGain, disconnectAudioNodes } from './audioGraphUtils';

export interface SystemAudioProcessor {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  meterAnalyser: AnalyserNode;
}

interface CreateSystemAudioProcessorOptions {
  context: AudioContext;
  stream: MediaStream;
  mixedDestination: MediaStreamAudioDestinationNode;
  sourceDestination: MediaStreamAudioDestinationNode;
  mixedMeterAnalyser: AnalyserNode;
  systemGain: number;
  monitorDestination?: AudioNode;
}

export function createSystemAudioProcessor({
  context,
  stream,
  mixedDestination,
  sourceDestination,
  mixedMeterAnalyser,
  systemGain,
  monitorDestination,
}: CreateSystemAudioProcessorOptions): SystemAudioProcessor {
  const processor: SystemAudioProcessor = {
    source: context.createMediaStreamSource(stream),
    gain: context.createGain(),
    meterAnalyser: context.createAnalyser(),
  };

  processor.gain.gain.value = clampAudioGain(systemGain);
  processor.meterAnalyser.fftSize = 256;
  processor.meterAnalyser.smoothingTimeConstant = 0.82;
  processor.source.connect(processor.gain);
  processor.gain.connect(mixedDestination);
  processor.gain.connect(sourceDestination);
  processor.gain.connect(mixedMeterAnalyser);
  processor.gain.connect(processor.meterAnalyser);
  if (monitorDestination) processor.gain.connect(monitorDestination);
  return processor;
}

export function applySystemAudioGain(
  processor: SystemAudioProcessor,
  systemGain: number,
  now: number,
): void {
  processor.gain.gain.setTargetAtTime(clampAudioGain(systemGain), now, 0.01);
}

export function disposeSystemAudioProcessor(processor: SystemAudioProcessor | null): void {
  if (!processor) return;
  disconnectAudioNodes(processor.source, processor.gain, processor.meterAnalyser);
}
