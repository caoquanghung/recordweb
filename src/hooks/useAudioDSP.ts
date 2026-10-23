'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAudioGraph,
  disposeAudioGraph,
  getAudioGraphStreams,
  SILENT_AUDIO_LEVELS,
  startAudioGraphMeter,
  type AudioGraph,
  type AudioLevels,
} from './audioDspGraph';
import { getErrorMessage } from '@/hooks/mediaHookUtils';
import {
  applyMicrophoneGain,
  applyMicrophonePreset,
  DEFAULT_CUSTOM_CONFIG,
  getPresetParameters,
  type AudioDspPreset,
  type MicrophoneGateState,
} from './microphoneAudioProcessor';
import {
  applySystemAudioGain,
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
  monitorSystemAudio?: boolean;
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

export function useAudioDSP({
  microphoneStream,
  systemAudioStream,
  preset,
  muted,
  micGain = 1,
  systemGain = 1,
  monitorSystemAudio = false,
  customConfig = DEFAULT_CUSTOM_CONFIG,
}: UseAudioDSPOptions): UseAudioDSPResult {
  const graphRef = useRef<AudioGraph | null>(null);
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
  const [levels, setLevels] = useState<AudioLevels>(SILENT_AUDIO_LEVELS);
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
        setLevels(SILENT_AUDIO_LEVELS);
        setError(null);
      }, 0);
      return () => window.clearTimeout(resetState);
    }

    let stopMeter: (() => void) | null = null;
    const initializeGraph = window.setTimeout(() => {
      try {
        setState('initializing');
        setError(null);

        const initialConfiguration = configurationRef.current;
        const graph = createAudioGraph({
          microphoneStream,
          systemAudioStream,
          preset: initialConfiguration.preset,
          customConfig: initialConfiguration.customConfig,
          muted: initialConfiguration.muted,
          micGain: initialConfiguration.micGain,
          systemGain: initialConfiguration.systemGain,
          monitorSystemAudio,
          gateState: gateStateRef.current,
        });
        graphRef.current = graph;
        const streams = getAudioGraphStreams(graph);
        setOutputStream(streams.outputStream);
        setMicrophoneOutputStream(streams.microphoneOutputStream);
        setSystemAudioOutputStream(streams.systemAudioOutputStream);
        setState(graph.context.state === 'running' ? 'running' : 'suspended');

        graph.context.onstatechange = () => {
          if (graphRef.current?.context !== graph.context) return;
          setState(graph.context.state === 'running'
            ? 'running'
            : graph.context.state === 'closed' ? 'closed' : 'suspended');
        };
        stopMeter = startAudioGraphMeter(graph, gateStateRef.current, setLevels);
      } catch (cause) {
        setState('error');
        setError(getErrorMessage(cause, 'The Web Audio processing graph could not be created.'));
      }
    }, 0);

    return () => {
      window.clearTimeout(initializeGraph);
      stopMeter?.();
      stopMeter = null;

      const graph = graphRef.current;
      graphRef.current = null;
      if (!graph) return;
      disposeAudioGraph(graph);
    };
  }, [microphoneStream, monitorSystemAudio, systemAudioStream]);

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
