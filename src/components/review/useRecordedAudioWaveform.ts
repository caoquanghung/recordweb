'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decodeRecordedWaveform,
  isRecordedWaveformPeaks,
} from '@/lib/audioWaveform';

export type RecordedWaveformState = 'loading' | 'ready' | 'unavailable';

interface UseRecordedAudioWaveformOptions {
  blob?: Blob;
  src?: string;
  durationSeconds: number;
  storedPeaks?: number[];
  onPeaksReady?: (peaks: number[]) => void;
}

export function useRecordedAudioWaveform({
  blob,
  src,
  durationSeconds,
  storedPeaks,
  onPeaksReady,
}: UseRecordedAudioWaveformOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [decodedPeaks, setDecodedPeaks] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(durationSeconds);
  const [decodeState, setDecodeState] = useState<RecordedWaveformState>('loading');
  const hasStoredPeaks = isRecordedWaveformPeaks(storedPeaks);

  useEffect(() => {
    const url = blob ? URL.createObjectURL(blob) : src;
    const audio = audioRef.current;
    if (audio && url) {
      audio.src = url;
      audio.load();
    }

    return () => {
      if (audio) {
        audio.removeAttribute('src');
        audio.load();
      }
      if (blob && url) URL.revokeObjectURL(url);
    };
  }, [blob, src]);

  useEffect(() => {
    if (hasStoredPeaks) return;

    let cancelled = false;
    const controller = new AbortController();

    const decodeRecordedAudio = async () => {
      setDecodeState('loading');
      setDecodedPeaks([]);
      try {
        const sourceBlob = blob ?? (src
          ? await fetch(src, { signal: controller.signal }).then((response) => {
            if (!response.ok) throw new Error('Could not load the recorded audio file.');
            return response.blob();
          })
          : null);
        if (!sourceBlob) throw new Error('No recorded audio source is available.');

        const decoded = await decodeRecordedWaveform(sourceBlob);
        if (cancelled) return;
        setDecodedPeaks(decoded.peaks);
        setMediaDuration(decoded.durationSeconds || durationSeconds);
        setDecodeState('ready');
        onPeaksReady?.(decoded.peaks);
      } catch {
        if (!cancelled) setDecodeState('unavailable');
      }
    };

    void decodeRecordedAudio();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [blob, durationSeconds, hasStoredPeaks, onPeaksReady, src]);

  const effectiveDuration = hasStoredPeaks ? durationSeconds : mediaDuration;
  const waveformState: RecordedWaveformState = hasStoredPeaks ? 'ready' : decodeState;
  const peaks = hasStoredPeaks ? storedPeaks : decodedPeaks;
  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;

  const seekToFraction = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (!audio || !effectiveDuration) return;
    const nextTime = Math.min(1, Math.max(0, fraction)) * effectiveDuration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [effectiveDuration]);

  const updateDuration = useCallback((duration: number) => {
    if (Number.isFinite(duration)) setMediaDuration(duration);
  }, []);

  const resetCurrentTime = useCallback(() => {
    setCurrentTime(0);
  }, []);

  return {
    audioRef,
    currentTime,
    duration: effectiveDuration,
    peaks,
    progress,
    waveformState,
    seekToFraction,
    setCurrentTime,
    updateDuration,
    resetCurrentTime,
  };
}
