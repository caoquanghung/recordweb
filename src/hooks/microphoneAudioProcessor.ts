import type { AudioFilterConfig } from '@/types/media';
import {
  clampAudioGain,
  disconnectAudioNodes,
  readAnalyserRmsDb,
} from './audioGraphUtils';

export type AudioDspPreset = 'natural' | 'voice-clarity' | 'noise-reduction' | 'podcast' | 'custom';

interface PresetParameters {
  highPassFrequency: number;
  presenceGain: number;
  lowPassFrequency: number;
  compressorThreshold: number;
  compressorKnee: number;
  compressorRatio: number;
  gateEnabled: boolean;
  gateThresholdDb: number;
}

export interface MicrophoneGateState {
  enabled: boolean;
  thresholdDb: number;
  lastVoiceAt: number;
}

export interface MicrophoneAudioProcessor {
  source: MediaStreamAudioSourceNode;
  highPass: BiquadFilterNode;
  presence: BiquadFilterNode;
  lowPass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  gate: GainNode;
  gain: GainNode;
  gateAnalyser: AnalyserNode;
  gateSamples: Uint8Array<ArrayBuffer>;
  meterAnalyser: AnalyserNode;
}

interface CreateMicrophoneAudioProcessorOptions {
  context: AudioContext;
  stream: MediaStream;
  mixedDestination: MediaStreamAudioDestinationNode;
  sourceDestination: MediaStreamAudioDestinationNode;
  mixedMeterAnalyser: AnalyserNode;
  preset: AudioDspPreset;
  customConfig: AudioFilterConfig;
  muted: boolean;
  micGain: number;
  gateState: MicrophoneGateState;
}

export const DEFAULT_CUSTOM_CONFIG: AudioFilterConfig = {
  highPassEnabled: true,
  vocalBoostEnabled: true,
  lowPassEnabled: true,
  compressorEnabled: true,
  noiseGateEnabled: true,
  micGain: 1,
};

const PRESET_PARAMETERS: Record<Exclude<AudioDspPreset, 'custom'>, PresetParameters> = {
  natural: {
    highPassFrequency: 10,
    presenceGain: 0,
    lowPassFrequency: 22000,
    compressorThreshold: 0,
    compressorKnee: 0,
    compressorRatio: 1,
    gateEnabled: false,
    gateThresholdDb: -60,
  },
  'voice-clarity': {
    highPassFrequency: 80,
    presenceGain: 4,
    lowPassFrequency: 12000,
    compressorThreshold: -24,
    compressorKnee: 30,
    compressorRatio: 4,
    gateEnabled: true,
    gateThresholdDb: -50,
  },
  'noise-reduction': {
    highPassFrequency: 100,
    presenceGain: 2,
    lowPassFrequency: 10000,
    compressorThreshold: -26,
    compressorKnee: 24,
    compressorRatio: 4,
    gateEnabled: true,
    gateThresholdDb: -45,
  },
  podcast: {
    highPassFrequency: 80,
    presenceGain: 5,
    lowPassFrequency: 12000,
    compressorThreshold: -28,
    compressorKnee: 30,
    compressorRatio: 4.5,
    gateEnabled: true,
    gateThresholdDb: -50,
  },
};

export function getPresetParameters(
  preset: AudioDspPreset,
  customConfig: AudioFilterConfig = DEFAULT_CUSTOM_CONFIG,
): PresetParameters {
  if (preset === 'custom') {
    return {
      highPassFrequency: customConfig.highPassEnabled ? 80 : 10,
      presenceGain: customConfig.vocalBoostEnabled ? 4 : 0,
      lowPassFrequency: customConfig.lowPassEnabled ? 12000 : 22000,
      compressorThreshold: customConfig.compressorEnabled ? -24 : 0,
      compressorKnee: customConfig.compressorEnabled ? 30 : 0,
      compressorRatio: customConfig.compressorEnabled ? 4 : 1,
      gateEnabled: customConfig.noiseGateEnabled,
      gateThresholdDb: -50,
    };
  }

  return { ...PRESET_PARAMETERS[preset] };
}

function getEffectiveMicrophoneGain(
  preset: AudioDspPreset,
  customMicGain: number,
  micGain: number,
): number {
  const customMultiplier = preset === 'custom' ? customMicGain : 1;
  return clampAudioGain(micGain * customMultiplier);
}

function setInitialPresetParameters(
  processor: MicrophoneAudioProcessor,
  parameters: PresetParameters,
): void {
  processor.highPass.frequency.value = parameters.highPassFrequency;
  processor.presence.gain.value = parameters.presenceGain;
  processor.lowPass.frequency.value = parameters.lowPassFrequency;
  processor.compressor.threshold.value = parameters.compressorThreshold;
  processor.compressor.knee.value = parameters.compressorKnee;
  processor.compressor.ratio.value = parameters.compressorRatio;
}

export function createMicrophoneAudioProcessor({
  context,
  stream,
  mixedDestination,
  sourceDestination,
  mixedMeterAnalyser,
  preset,
  customConfig,
  muted,
  micGain,
  gateState,
}: CreateMicrophoneAudioProcessorOptions): MicrophoneAudioProcessor {
  const processor: MicrophoneAudioProcessor = {
    source: context.createMediaStreamSource(stream),
    highPass: context.createBiquadFilter(),
    presence: context.createBiquadFilter(),
    lowPass: context.createBiquadFilter(),
    compressor: context.createDynamicsCompressor(),
    gate: context.createGain(),
    gain: context.createGain(),
    gateAnalyser: context.createAnalyser(),
    gateSamples: new Uint8Array(256),
    meterAnalyser: context.createAnalyser(),
  };

  processor.highPass.type = 'highpass';
  processor.highPass.Q.value = 0.707;
  processor.presence.type = 'peaking';
  processor.presence.frequency.value = 2800;
  processor.presence.Q.value = 1.2;
  processor.lowPass.type = 'lowpass';
  processor.lowPass.Q.value = 0.707;
  processor.compressor.attack.value = 0.003;
  processor.compressor.release.value = 0.25;
  processor.gateAnalyser.fftSize = 256;
  processor.gateAnalyser.smoothingTimeConstant = 0.68;
  processor.meterAnalyser.fftSize = 256;
  processor.meterAnalyser.smoothingTimeConstant = 0.82;

  const parameters = getPresetParameters(preset, customConfig);
  setInitialPresetParameters(processor, parameters);
  processor.gate.gain.value = 1;
  processor.gain.gain.value = muted
    ? 0
    : getEffectiveMicrophoneGain(preset, customConfig.micGain, micGain);
  gateState.enabled = parameters.gateEnabled;
  gateState.thresholdDb = parameters.gateThresholdDb;

  processor.source.connect(processor.highPass);
  processor.highPass.connect(processor.presence);
  processor.presence.connect(processor.lowPass);
  processor.lowPass.connect(processor.compressor);
  processor.compressor.connect(processor.gateAnalyser);
  processor.compressor.connect(processor.gate);
  processor.gate.connect(processor.gain);
  processor.gain.connect(mixedDestination);
  processor.gain.connect(sourceDestination);
  processor.gain.connect(mixedMeterAnalyser);
  processor.gain.connect(processor.meterAnalyser);

  return processor;
}

export function applyMicrophonePreset(
  processor: MicrophoneAudioProcessor,
  preset: AudioDspPreset,
  customConfig: AudioFilterConfig,
  gateState: MicrophoneGateState,
  now: number,
): void {
  const parameters = getPresetParameters(preset, customConfig);
  processor.highPass.frequency.setTargetAtTime(parameters.highPassFrequency, now, 0.02);
  processor.presence.gain.setTargetAtTime(parameters.presenceGain, now, 0.02);
  processor.lowPass.frequency.setTargetAtTime(parameters.lowPassFrequency, now, 0.02);
  processor.compressor.threshold.setTargetAtTime(parameters.compressorThreshold, now, 0.02);
  processor.compressor.knee.setTargetAtTime(parameters.compressorKnee, now, 0.02);
  processor.compressor.ratio.setTargetAtTime(parameters.compressorRatio, now, 0.02);
  gateState.enabled = parameters.gateEnabled;
  gateState.thresholdDb = parameters.gateThresholdDb;
  if (!parameters.gateEnabled) processor.gate.gain.setTargetAtTime(1, now, 0.01);
}

export function applyMicrophoneGain(
  processor: MicrophoneAudioProcessor,
  preset: AudioDspPreset,
  customMicGain: number,
  muted: boolean,
  micGain: number,
  now: number,
): void {
  const gain = muted ? 0 : getEffectiveMicrophoneGain(preset, customMicGain, micGain);
  processor.gain.gain.setTargetAtTime(gain, now, 0.01);
}

export function processMicrophoneNoiseGate(
  processor: MicrophoneAudioProcessor,
  gateState: MicrophoneGateState,
  timestamp: number,
  now: number,
): void {
  const gateDb = readAnalyserRmsDb(processor.gateAnalyser, processor.gateSamples);
  if (!gateState.enabled || gateDb >= gateState.thresholdDb) {
    gateState.lastVoiceAt = timestamp;
    processor.gate.gain.setTargetAtTime(1, now, 0.01);
  } else if (timestamp - gateState.lastVoiceAt >= 150) {
    processor.gate.gain.setTargetAtTime(0, now, 0.08);
  }
}

export function disposeMicrophoneAudioProcessor(
  processor: MicrophoneAudioProcessor | null,
): void {
  if (!processor) return;
  disconnectAudioNodes(
    processor.source,
    processor.highPass,
    processor.presence,
    processor.lowPass,
    processor.compressor,
    processor.gate,
    processor.gain,
    processor.gateAnalyser,
    processor.meterAnalyser,
  );
}
