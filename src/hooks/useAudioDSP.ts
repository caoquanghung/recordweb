'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { disconnectAudioNodes, readAnalyserRmsDb } from './audioGraphUtils';
import { getErrorMessage } from '@/hooks/mediaHookUtils';
import {
  applyMicrophoneGain,
  applyMicrophonePreset,
  createMicrophoneAudioProcessor,
  DEFAULT_CUSTOM_CONFIG,
  disposeMicrophoneAudioProcessor,
  getPresetParameters,
  processMicrophoneNoiseGate,
  type AudioDspPreset,
  type MicrophoneAudioProcessor,
  type MicrophoneGateState,
} from './microphoneAudioProcessor';
import {
  applySystemAudioGain,
  createSystemAudioProcessor,
  disposeSystemAudioProcessor,
  type SystemAudioProcessor,
} from './systemAudioProcessor';
import type { AudioFilterConfig } from '@/types/media';

export { getPresetParameters };
export type { AudioDspPreset };
export type AudioDspState = 'idle' | 'initializing' | 'suspended' | 'running' | 'closed' | 'error';

export interface UseAudioDSPOptions {
  microphoneStream: MediaStream | null;
  systemAudioStream: MediaStream | null;
  preset: AudioDspPreset;
  muted: boolean;
  micGain?: number;
  systemGain?: number;
  customConfig?: AudioFilterConfig;
}

export interface UseAudioDSPResult {
  outputStream: MediaStream | null;
  microphoneOutputStream: MediaStream | null;
  systemAudioOutputStream: MediaStream | null;
  state: AudioDspState;
  level: number;
  levelDb: number;
  microphoneLevel: number;
  microphoneLevelDb: number;
  systemAudioLevel: number;
  systemAudioLevelDb: number;
  error: string | null;
  resume: () => Promise<boolean>;
  suspend: () => Promise<void>;
}

interface AudioGraph {
  context: AudioContext;
  mixedDestination: MediaStreamAudioDestinationNode;
  microphoneDestination: MediaStreamAudioDestinationNode | null;
  systemAudioDestination: MediaStreamAudioDestinationNode | null;
  microphone: MicrophoneAudioProcessor | null;
  systemAudio: SystemAudioProcessor | null;
  mixedMeterAnalyser: AnalyserNode;
}

interface AudioLevelSnapshot {
  level: number;
  levelDb: number;
}

interface AudioLevels {
  mixed: AudioLevelSnapshot;
  microphone: AudioLevelSnapshot;
  system: AudioLevelSnapshot;
}

const SILENT_LEVEL: AudioLevelSnapshot = { level: 0, levelDb: -100 };

function toLevelSnapshot(levelDb: number): AudioLevelSnapshot {
  return {
    levelDb,
    level: Math.min(1, Math.max(0, (levelDb + 60) / 60)),
  };
}

function disposeAudioGraph(graph: AudioGraph) {
  graph.context.onstatechange = null;
  disposeMicrophoneAudioProcessor(graph.microphone);
  disposeSystemAudioProcessor(graph.systemAudio);
  disconnectAudioNodes(graph.mixedMeterAnalyser);
  [graph.mixedDestination, graph.microphoneDestination, graph.systemAudioDestination]
    .forEach((destination) => destination?.stream.getTracks().forEach((track) => track.stop()));
  void graph.context.close();
}

export function useAudioDSP({
  microphoneStream,
  systemAudioStream,
  preset,
  muted,
  micGain = 1,
  systemGain = 1,
  customConfig = DEFAULT_CUSTOM_CONFIG,
}: UseAudioDSPOptions): UseAudioDSPResult {
  const graphRef = useRef<AudioGraph | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const gateStateRef = useRef<MicrophoneGateState>({
    enabled: true,
    thresholdDb: -50,
    lastVoiceAt: 0,
  });
  const configurationRef = useRef({ preset, customConfig, muted, micGain, systemGain });
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);
  const [microphoneOutputStream, setMicrophoneOutputStream] = useState<MediaStream | null>(null);
  const [systemAudioOutputStream, setSystemAudioOutputStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<AudioDspState>('idle');
  const [levels, setLevels] = useState<AudioLevels>({
    mixed: SILENT_LEVEL,
    microphone: SILENT_LEVEL,
    system: SILENT_LEVEL,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    configurationRef.current = { preset, customConfig, muted, micGain, systemGain };
  }, [customConfig, micGain, muted, preset, systemGain]);

  useEffect(() => {
    const hasMicrophone = Boolean(microphoneStream?.getAudioTracks().length);
    const hasSystemAudio = Boolean(systemAudioStream?.getAudioTracks().length);
    if (!hasMicrophone && !hasSystemAudio) {
      const resetState = window.setTimeout(() => {
        setOutputStream(null);
        setMicrophoneOutputStream(null);
        setSystemAudioOutputStream(null);
        setState('idle');
        setLevels({ mixed: SILENT_LEVEL, microphone: SILENT_LEVEL, system: SILENT_LEVEL });
        setError(null);
      }, 0);
      return () => window.clearTimeout(resetState);
    }

    const initializeGraph = window.setTimeout(() => {
      let initializingContext: AudioContext | null = null;
      let initializingGraph: AudioGraph | null = null;
      try {
        setState('initializing');
        setError(null);

        const context = new AudioContext();
        initializingContext = context;
        const mixedDestination = context.createMediaStreamDestination();
        const microphoneDestination = hasMicrophone ? context.createMediaStreamDestination() : null;
        const systemAudioDestination = hasSystemAudio ? context.createMediaStreamDestination() : null;
        const mixedMeterAnalyser = context.createAnalyser();
        mixedMeterAnalyser.fftSize = 256;
        mixedMeterAnalyser.smoothingTimeConstant = 0.82;

        const graph: AudioGraph = {
          context,
          mixedDestination,
          microphoneDestination,
          systemAudioDestination,
          microphone: null,
          systemAudio: null,
          mixedMeterAnalyser,
        };
        initializingGraph = graph;

        const initialConfiguration = configurationRef.current;
        graph.microphone = hasMicrophone && microphoneStream && microphoneDestination
          ? createMicrophoneAudioProcessor({
              context,
              stream: microphoneStream,
              mixedDestination,
              sourceDestination: microphoneDestination,
              mixedMeterAnalyser,
              preset: initialConfiguration.preset,
              customConfig: initialConfiguration.customConfig,
              muted: initialConfiguration.muted,
              micGain: initialConfiguration.micGain,
              gateState: gateStateRef.current,
            })
          : null;
        graph.systemAudio = hasSystemAudio && systemAudioStream && systemAudioDestination
          ? createSystemAudioProcessor({
              context,
              stream: systemAudioStream,
              mixedDestination,
              sourceDestination: systemAudioDestination,
              mixedMeterAnalyser,
              systemGain: initialConfiguration.systemGain,
            })
          : null;
        graphRef.current = graph;
        initializingGraph = null;
        initializingContext = null;
        setOutputStream(mixedDestination.stream);
        setMicrophoneOutputStream(microphoneDestination?.stream ?? null);
        setSystemAudioOutputStream(systemAudioDestination?.stream ?? null);
        setState(context.state === 'running' ? 'running' : 'suspended');

        context.onstatechange = () => {
          if (graphRef.current?.context !== context) return;
          setState(context.state === 'running' ? 'running' : context.state === 'closed' ? 'closed' : 'suspended');
        };

        const mixedMeterData = new Uint8Array(mixedMeterAnalyser.fftSize);
        const microphoneMeterData = graph.microphone
          ? new Uint8Array(graph.microphone.meterAnalyser.fftSize)
          : null;
        const systemMeterData = graph.systemAudio
          ? new Uint8Array(graph.systemAudio.meterAnalyser.fftSize)
          : null;
        let lastMeterPublish = 0;

        const updateAudio = (timestamp: number) => {
          if (context.state === 'running') {
            if (graph.microphone) {
              processMicrophoneNoiseGate(
                graph.microphone,
                gateStateRef.current,
                timestamp,
                context.currentTime,
              );
            }

            if (timestamp - lastMeterPublish >= 50) {
              const mixedDb = readAnalyserRmsDb(mixedMeterAnalyser, mixedMeterData);
              const microphoneDb = graph.microphone && microphoneMeterData
                ? readAnalyserRmsDb(graph.microphone.meterAnalyser, microphoneMeterData)
                : -100;
              const systemDb = graph.systemAudio && systemMeterData
                ? readAnalyserRmsDb(graph.systemAudio.meterAnalyser, systemMeterData)
                : -100;
              setLevels({
                mixed: toLevelSnapshot(mixedDb),
                microphone: toLevelSnapshot(microphoneDb),
                system: toLevelSnapshot(systemDb),
              });
              lastMeterPublish = timestamp;
            }
          }
          animationFrameRef.current = requestAnimationFrame(updateAudio);
        };

        animationFrameRef.current = requestAnimationFrame(updateAudio);
      } catch (cause) {
        if (initializingGraph) {
          disposeAudioGraph(initializingGraph);
        } else if (initializingContext && initializingContext.state !== 'closed') {
          void initializingContext.close();
        }
        setState('error');
        setError(getErrorMessage(cause, 'The Web Audio processing graph could not be created.'));
      }
    }, 0);

    return () => {
      window.clearTimeout(initializeGraph);
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;

      const graph = graphRef.current;
      graphRef.current = null;
      if (!graph) return;
      disposeAudioGraph(graph);
    };
  }, [microphoneStream, systemAudioStream]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph?.microphone) return;
    applyMicrophonePreset(
      graph.microphone,
      preset,
      customConfig,
      gateStateRef.current,
      graph.context.currentTime,
    );
  }, [customConfig, preset]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    if (graph.microphone) {
      applyMicrophoneGain(graph.microphone, preset, customConfig.micGain, muted, micGain, now);
    }
    if (graph.systemAudio) {
      applySystemAudioGain(graph.systemAudio, systemGain, now);
    }
  }, [customConfig.micGain, micGain, muted, preset, systemGain]);

  const resume = useCallback(async () => {
    const context = graphRef.current?.context;
    if (!context) return false;
    try {
      if (context.state === 'suspended') await context.resume();
      setState(context.state === 'running' ? 'running' : 'suspended');
      return context.state === 'running';
    } catch (cause) {
      setState('error');
      setError(getErrorMessage(cause, 'Audio could not be started.'));
      return false;
    }
  }, []);

  const suspend = useCallback(async () => {
    const context = graphRef.current?.context;
    if (context?.state === 'running') await context.suspend();
  }, []);

  return {
    outputStream,
    microphoneOutputStream,
    systemAudioOutputStream,
    state,
    level: levels.mixed.level,
    levelDb: levels.mixed.levelDb,
    microphoneLevel: levels.microphone.level,
    microphoneLevelDb: levels.microphone.levelDb,
    systemAudioLevel: levels.system.level,
    systemAudioLevelDb: levels.system.levelDb,
    error,
    resume,
    suspend,
  };
}
