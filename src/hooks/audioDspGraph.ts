import { disconnectAudioNodes, readAnalyserRmsDb } from './audioGraphUtils';
import {
  createMicrophoneAudioProcessor,
  disposeMicrophoneAudioProcessor,
  processMicrophoneNoiseGate,
  type AudioDspPreset,
  type MicrophoneAudioProcessor,
  type MicrophoneGateState,
} from './microphoneAudioProcessor';
import {
  createSystemAudioProcessor,
  disposeSystemAudioProcessor,
  type SystemAudioProcessor,
} from './systemAudioProcessor';
import type { AudioFilterConfig } from '@/types/media';

export interface AudioGraph {
  context: AudioContext;
  mixedDestination: MediaStreamAudioDestinationNode;
  microphoneDestination: MediaStreamAudioDestinationNode | null;
  systemAudioDestination: MediaStreamAudioDestinationNode | null;
  microphone: MicrophoneAudioProcessor | null;
  systemAudio: SystemAudioProcessor | null;
  mixedMeterAnalyser: AnalyserNode;
}

export interface AudioLevelSnapshot {
  level: number;
  levelDb: number;
}

export interface AudioLevels {
  mixed: AudioLevelSnapshot;
  microphone: AudioLevelSnapshot;
  system: AudioLevelSnapshot;
}

interface CreateAudioGraphOptions {
  microphoneStream: MediaStream | null;
  systemAudioStream: MediaStream | null;
  preset: AudioDspPreset;
  customConfig: AudioFilterConfig;
  muted: boolean;
  micGain: number;
  systemGain: number;
  monitorSystemAudio: boolean;
  gateState: MicrophoneGateState;
}

export const SILENT_AUDIO_LEVEL: AudioLevelSnapshot = { level: 0, levelDb: -100 };
export const SILENT_AUDIO_LEVELS: AudioLevels = {
  mixed: SILENT_AUDIO_LEVEL,
  microphone: SILENT_AUDIO_LEVEL,
  system: SILENT_AUDIO_LEVEL,
};

function toLevelSnapshot(levelDb: number): AudioLevelSnapshot {
  return {
    levelDb,
    level: Math.min(1, Math.max(0, (levelDb + 60) / 60)),
  };
}

export function disposeAudioGraph(graph: AudioGraph): void {
  graph.context.onstatechange = null;
  disposeMicrophoneAudioProcessor(graph.microphone);
  disposeSystemAudioProcessor(graph.systemAudio);
  disconnectAudioNodes(graph.mixedMeterAnalyser);
  [graph.mixedDestination, graph.microphoneDestination, graph.systemAudioDestination]
    .forEach((destination) => destination?.stream.getTracks().forEach((track) => track.stop()));
  void graph.context.close();
}

export function createAudioGraph({
  microphoneStream,
  systemAudioStream,
  preset,
  customConfig,
  muted,
  micGain,
  systemGain,
  monitorSystemAudio,
  gateState,
}: CreateAudioGraphOptions): AudioGraph {
  const hasMicrophone = Boolean(microphoneStream?.getAudioTracks().length);
  const hasSystemAudio = Boolean(systemAudioStream?.getAudioTracks().length);
  const context = new AudioContext();
  let graph: AudioGraph | null = null;

  try {
    const mixedDestination = context.createMediaStreamDestination();
    const microphoneDestination = hasMicrophone ? context.createMediaStreamDestination() : null;
    const systemAudioDestination = hasSystemAudio ? context.createMediaStreamDestination() : null;
    const mixedMeterAnalyser = context.createAnalyser();
    mixedMeterAnalyser.fftSize = 256;
    mixedMeterAnalyser.smoothingTimeConstant = 0.82;

    graph = {
      context,
      mixedDestination,
      microphoneDestination,
      systemAudioDestination,
      microphone: null,
      systemAudio: null,
      mixedMeterAnalyser,
    };
    graph.microphone = hasMicrophone && microphoneStream && microphoneDestination
      ? createMicrophoneAudioProcessor({
          context,
          stream: microphoneStream,
          mixedDestination,
          sourceDestination: microphoneDestination,
          mixedMeterAnalyser,
          preset,
          customConfig,
          muted,
          micGain,
          gateState,
        })
      : null;
    graph.systemAudio = hasSystemAudio && systemAudioStream && systemAudioDestination
      ? createSystemAudioProcessor({
          context,
          stream: systemAudioStream,
          mixedDestination,
          sourceDestination: systemAudioDestination,
          mixedMeterAnalyser,
          systemGain,
          monitorDestination: monitorSystemAudio ? context.destination : undefined,
        })
      : null;
    return graph;
  } catch (cause) {
    if (graph) disposeAudioGraph(graph);
    else if (context.state !== 'closed') void context.close();
    throw cause;
  }
}

export function getAudioGraphStreams(graph: AudioGraph) {
  return {
    outputStream: graph.mixedDestination.stream,
    microphoneOutputStream: graph.microphoneDestination?.stream ?? null,
    systemAudioOutputStream: graph.systemAudioDestination?.stream ?? null,
  };
}

export function startAudioGraphMeter(
  graph: AudioGraph,
  gateState: MicrophoneGateState,
  onLevels: (levels: AudioLevels) => void,
): () => void {
  const mixedMeterData = new Uint8Array(graph.mixedMeterAnalyser.fftSize);
  const microphoneMeterData = graph.microphone
    ? new Uint8Array(graph.microphone.meterAnalyser.fftSize)
    : null;
  const systemMeterData = graph.systemAudio
    ? new Uint8Array(graph.systemAudio.meterAnalyser.fftSize)
    : null;
  let animationFrame: number | null = null;
  let lastMeterPublish = 0;

  const updateAudio = (timestamp: number) => {
    if (graph.context.state === 'running') {
      if (graph.microphone) {
        processMicrophoneNoiseGate(
          graph.microphone,
          gateState,
          timestamp,
          graph.context.currentTime,
        );
      }

      if (timestamp - lastMeterPublish >= 50) {
        const mixedDb = readAnalyserRmsDb(graph.mixedMeterAnalyser, mixedMeterData);
        const microphoneDb = graph.microphone && microphoneMeterData
          ? readAnalyserRmsDb(graph.microphone.meterAnalyser, microphoneMeterData)
          : -100;
        const systemDb = graph.systemAudio && systemMeterData
          ? readAnalyserRmsDb(graph.systemAudio.meterAnalyser, systemMeterData)
          : -100;
        onLevels({
          mixed: toLevelSnapshot(mixedDb),
          microphone: toLevelSnapshot(microphoneDb),
          system: toLevelSnapshot(systemDb),
        });
        lastMeterPublish = timestamp;
      }
    }
    animationFrame = requestAnimationFrame(updateAudio);
  };

  animationFrame = requestAnimationFrame(updateAudio);
  return () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };
}
