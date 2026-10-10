'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioFilterConfig } from '@/types/media';

export type AudioDspPreset = 'natural' | 'voice-clarity' | 'noise-reduction' | 'podcast' | 'custom';
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
  state: AudioDspState;
  level: number;
  levelDb: number;
  error: string | null;
  resume: () => Promise<boolean>;
  suspend: () => Promise<void>;
}

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

interface AudioGraph {
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  microphoneSource: MediaStreamAudioSourceNode | null;
  systemSource: MediaStreamAudioSourceNode | null;
  highPass: BiquadFilterNode;
  presence: BiquadFilterNode;
  lowPass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  gate: GainNode;
  microphoneGain: GainNode;
  systemGain: GainNode;
  meterAnalyser: AnalyserNode;
  gateAnalyser: AnalyserNode;
}

const DEFAULT_CUSTOM_CONFIG: AudioFilterConfig = {
  highPassEnabled: true,
  vocalBoostEnabled: true,
  lowPassEnabled: true,
  compressorEnabled: true,
  noiseGateEnabled: true,
  micGain: 1,
};

export function getPresetParameters(
  preset: AudioDspPreset,
  customConfig: AudioFilterConfig = DEFAULT_CUSTOM_CONFIG,
): PresetParameters {
  if (preset === 'natural') {
    return {
      highPassFrequency: 10,
      presenceGain: 0,
      lowPassFrequency: 22000,
      compressorThreshold: 0,
      compressorKnee: 0,
      compressorRatio: 1,
      gateEnabled: false,
      gateThresholdDb: -60,
    };
  }

  if (preset === 'noise-reduction') {
    return {
      highPassFrequency: 100,
      presenceGain: 2,
      lowPassFrequency: 10000,
      compressorThreshold: -26,
      compressorKnee: 24,
      compressorRatio: 4,
      gateEnabled: true,
      gateThresholdDb: -45,
    };
  }

  if (preset === 'podcast') {
    return {
      highPassFrequency: 80,
      presenceGain: 5,
      lowPassFrequency: 12000,
      compressorThreshold: -28,
      compressorKnee: 30,
      compressorRatio: 4.5,
      gateEnabled: true,
      gateThresholdDb: -50,
    };
  }

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

  return {
    highPassFrequency: 80,
    presenceGain: 4,
    lowPassFrequency: 12000,
    compressorThreshold: -24,
    compressorKnee: 30,
    compressorRatio: 4,
    gateEnabled: true,
    gateThresholdDb: -50,
  };
}

function disconnectNode(node: AudioNode | null) {
  try {
    node?.disconnect();
  } catch {
    // A partially initialized graph may already be disconnected.
  }
}

function rmsToDb(rms: number) {
  return rms > 0 ? 20 * Math.log10(rms) : -100;
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
  const gateEnabledRef = useRef(true);
  const gateThresholdRef = useRef(-50);
  const lastVoiceAtRef = useRef(0);
  const configurationRef = useRef({ preset, customConfig, muted, micGain, systemGain });
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<AudioDspState>('idle');
  const [level, setLevel] = useState(0);
  const [levelDb, setLevelDb] = useState(-100);
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
        setState('idle');
        setLevel(0);
        setLevelDb(-100);
        setError(null);
      }, 0);
      return () => window.clearTimeout(resetState);
    }

    const initializeGraph = window.setTimeout(() => {
      try {
        setState('initializing');
        setError(null);

        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        const highPass = context.createBiquadFilter();
        const presence = context.createBiquadFilter();
        const lowPass = context.createBiquadFilter();
        const compressor = context.createDynamicsCompressor();
        const gate = context.createGain();
        const microphoneGain = context.createGain();
        const systemGainNode = context.createGain();
        const meterAnalyser = context.createAnalyser();
        const gateAnalyser = context.createAnalyser();

        highPass.type = 'highpass';
        highPass.Q.value = 0.707;
        presence.type = 'peaking';
        presence.frequency.value = 2800;
        presence.Q.value = 1.2;
        lowPass.type = 'lowpass';
        lowPass.Q.value = 0.707;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        meterAnalyser.fftSize = 256;
        meterAnalyser.smoothingTimeConstant = 0.82;
        gateAnalyser.fftSize = 256;
        gateAnalyser.smoothingTimeConstant = 0.68;

        const initialConfiguration = configurationRef.current;
        const initialParameters = getPresetParameters(initialConfiguration.preset, initialConfiguration.customConfig);
        highPass.frequency.value = initialParameters.highPassFrequency;
        presence.gain.value = initialParameters.presenceGain;
        lowPass.frequency.value = initialParameters.lowPassFrequency;
        compressor.threshold.value = initialParameters.compressorThreshold;
        compressor.knee.value = initialParameters.compressorKnee;
        compressor.ratio.value = initialParameters.compressorRatio;
        gate.gain.value = 1;
        microphoneGain.gain.value = initialConfiguration.muted
          ? 0
          : Math.max(0, Math.min(2, initialConfiguration.micGain * (initialConfiguration.preset === 'custom' ? initialConfiguration.customConfig.micGain : 1)));
        systemGainNode.gain.value = Math.max(0, Math.min(2, initialConfiguration.systemGain));
        gateEnabledRef.current = initialParameters.gateEnabled;
        gateThresholdRef.current = initialParameters.gateThresholdDb;

        const microphoneSource = hasMicrophone && microphoneStream
          ? context.createMediaStreamSource(microphoneStream)
          : null;
        const systemSource = hasSystemAudio && systemAudioStream
          ? context.createMediaStreamSource(systemAudioStream)
          : null;

        if (microphoneSource) {
          microphoneSource.connect(highPass);
          highPass.connect(presence);
          presence.connect(lowPass);
          lowPass.connect(compressor);
          compressor.connect(gateAnalyser);
          compressor.connect(gate);
          gate.connect(microphoneGain);
          microphoneGain.connect(destination);
          microphoneGain.connect(meterAnalyser);
        }

        if (systemSource) {
          systemSource.connect(systemGainNode);
          systemGainNode.connect(destination);
          systemGainNode.connect(meterAnalyser);
        }

        const graph: AudioGraph = {
          context,
          destination,
          microphoneSource,
          systemSource,
          highPass,
          presence,
          lowPass,
          compressor,
          gate,
          microphoneGain,
          systemGain: systemGainNode,
          meterAnalyser,
          gateAnalyser,
        };
        graphRef.current = graph;
        setOutputStream(destination.stream);
        setState(context.state === 'running' ? 'running' : 'suspended');

        context.onstatechange = () => {
          if (graphRef.current?.context !== context) return;
          setState(context.state === 'running' ? 'running' : context.state === 'closed' ? 'closed' : 'suspended');
        };

        const meterData = new Uint8Array(meterAnalyser.fftSize);
        const gateData = new Uint8Array(gateAnalyser.fftSize);
        let lastMeterPublish = 0;

        const updateAudio = (timestamp: number) => {
          if (context.state === 'running') {
            if (microphoneSource) {
              gateAnalyser.getByteTimeDomainData(gateData);
              let gateSum = 0;
              for (const sample of gateData) {
                const normalized = (sample - 128) / 128;
                gateSum += normalized * normalized;
              }
              const gateDb = rmsToDb(Math.sqrt(gateSum / gateData.length));
              if (!gateEnabledRef.current || gateDb >= gateThresholdRef.current) {
                lastVoiceAtRef.current = timestamp;
                gate.gain.setTargetAtTime(1, context.currentTime, 0.01);
              } else if (timestamp - lastVoiceAtRef.current >= 150) {
                gate.gain.setTargetAtTime(0, context.currentTime, 0.08);
              }
            }

            if (timestamp - lastMeterPublish >= 50) {
              meterAnalyser.getByteTimeDomainData(meterData);
              let sum = 0;
              for (const sample of meterData) {
                const normalized = (sample - 128) / 128;
                sum += normalized * normalized;
              }
              const db = rmsToDb(Math.sqrt(sum / meterData.length));
              setLevelDb(db);
              setLevel(Math.min(1, Math.max(0, (db + 60) / 60)));
              lastMeterPublish = timestamp;
            }
          }
          animationFrameRef.current = requestAnimationFrame(updateAudio);
        };

        animationFrameRef.current = requestAnimationFrame(updateAudio);
      } catch (cause) {
        setState('error');
        setError(cause instanceof Error ? cause.message : 'The Web Audio processing graph could not be created.');
      }
    }, 0);

    return () => {
      window.clearTimeout(initializeGraph);
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;

      const graph = graphRef.current;
      graphRef.current = null;
      if (!graph) return;
      graph.context.onstatechange = null;
      disconnectNode(graph.microphoneSource);
      disconnectNode(graph.systemSource);
      disconnectNode(graph.highPass);
      disconnectNode(graph.presence);
      disconnectNode(graph.lowPass);
      disconnectNode(graph.compressor);
      disconnectNode(graph.gate);
      disconnectNode(graph.microphoneGain);
      disconnectNode(graph.systemGain);
      disconnectNode(graph.meterAnalyser);
      disconnectNode(graph.gateAnalyser);
      graph.destination.stream.getTracks().forEach((track) => track.stop());
      void graph.context.close();
    };
  }, [microphoneStream, systemAudioStream]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const parameters = getPresetParameters(preset, customConfig);
    const now = graph.context.currentTime;
    graph.highPass.frequency.setTargetAtTime(parameters.highPassFrequency, now, 0.02);
    graph.presence.gain.setTargetAtTime(parameters.presenceGain, now, 0.02);
    graph.lowPass.frequency.setTargetAtTime(parameters.lowPassFrequency, now, 0.02);
    graph.compressor.threshold.setTargetAtTime(parameters.compressorThreshold, now, 0.02);
    graph.compressor.knee.setTargetAtTime(parameters.compressorKnee, now, 0.02);
    graph.compressor.ratio.setTargetAtTime(parameters.compressorRatio, now, 0.02);
    gateEnabledRef.current = parameters.gateEnabled;
    gateThresholdRef.current = parameters.gateThresholdDb;
    if (!parameters.gateEnabled) graph.gate.gain.setTargetAtTime(1, now, 0.01);
  }, [customConfig, preset]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.context.currentTime;
    const customMultiplier = preset === 'custom' ? customConfig.micGain : 1;
    graph.microphoneGain.gain.setTargetAtTime(muted ? 0 : Math.max(0, Math.min(2, micGain * customMultiplier)), now, 0.01);
    graph.systemGain.gain.setTargetAtTime(Math.max(0, Math.min(2, systemGain)), now, 0.01);
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
      setError(cause instanceof Error ? cause.message : 'Audio could not be started.');
      return false;
    }
  }, []);

  const suspend = useCallback(async () => {
    const context = graphRef.current?.context;
    if (context?.state === 'running') await context.suspend();
  }, []);

  return { outputStream, state, level, levelDb, error, resume, suspend };
}
