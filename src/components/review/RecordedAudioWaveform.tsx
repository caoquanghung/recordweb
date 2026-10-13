'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import styles from './RecordedAudioWaveform.module.css';

const BAR_COUNT = 120;
const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 160;
const BAR_WIDTH = 6;
const BAR_GAP = VIEWBOX_WIDTH / BAR_COUNT;
const MIN_BAR_HEIGHT = 4;

interface RecordedAudioWaveformProps {
  blob: Blob;
  durationSeconds: number;
  mimeType: string;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function getRecordedPeaks(buffer: AudioBuffer, peakCount: number) {
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

export function RecordedAudioWaveform({
  blob,
  durationSeconds,
  mimeType,
}: RecordedAudioWaveformProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<SVGSVGElement | null>(null);
  const clipId = `recorded-waveform-${useId().replaceAll(':', '')}`;
  const [peaks, setPeaks] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(durationSeconds);
  const [waveformState, setWaveformState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const audio = audioRef.current;
    if (audio) {
      audio.src = url;
      audio.load();
    }
    return () => {
      if (audio) {
        audio.removeAttribute('src');
        audio.load();
      }
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  useEffect(() => {
    let cancelled = false;
    const AudioContextConstructor = window.AudioContext;
    const context = new AudioContextConstructor();
    const closeContext = () => {
      if (context.state !== 'closed') void context.close().catch(() => undefined);
    };

    const decodeRecordedAudio = async () => {
      setWaveformState('loading');
      setPeaks([]);
      try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        if (cancelled) return;
        setPeaks(getRecordedPeaks(decoded, BAR_COUNT));
        setMediaDuration(decoded.duration || durationSeconds);
        setWaveformState('ready');
      } catch {
        if (!cancelled) setWaveformState('unavailable');
      } finally {
        closeContext();
      }
    };

    void decodeRecordedAudio();
    return () => {
      cancelled = true;
      closeContext();
    };
  }, [blob, durationSeconds]);

  const progress = mediaDuration > 0 ? Math.min(1, currentTime / mediaDuration) : 0;
  const bars = peaks.map((peak, index) => {
    const height = Math.max(MIN_BAR_HEIGHT, peak * (VIEWBOX_HEIGHT - 24));
    return {
      height,
      key: index,
      x: index * BAR_GAP + (BAR_GAP - BAR_WIDTH) / 2,
      y: (VIEWBOX_HEIGHT - height) / 2,
    };
  });

  const seekFromWaveform = (event: MouseEvent<HTMLButtonElement>) => {
    const audio = audioRef.current;
    if (!audio || !mediaDuration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextTime = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * mediaDuration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <section className={styles.card} aria-label="Recorded audio waveform">
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.icon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 13v-2M8 17V7M12 20V4M16 16V8M20 14v-4" />
            </svg>
          </span>
          <div>
            <strong>Audio master</strong>
            <span>{mimeType.split(';')[0]} · waveform decoded from the recorded file</span>
          </div>
        </div>
        <span className={styles.status}>Recorded waveform</span>
      </div>

      {waveformState === 'ready' ? (
        <button
          className={styles.waveformButton}
          type="button"
          onClick={seekFromWaveform}
          aria-label="Seek in recorded audio"
        >
          <svg
            ref={waveformRef}
            className={styles.waveform}
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Amplitude waveform generated from the recorded audio file"
          >
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={progress * VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} />
              </clipPath>
            </defs>
            <g className={styles.waveformBase}>
              {bars.map((bar) => <rect key={`base-${bar.key}`} x={bar.x} y={bar.y} width={BAR_WIDTH} height={bar.height} rx="3" />)}
            </g>
            <g className={styles.waveformPlayed} clipPath={`url(#${clipId})`}>
              {bars.map((bar) => <rect key={`played-${bar.key}`} x={bar.x} y={bar.y} width={BAR_WIDTH} height={bar.height} rx="3" />)}
            </g>
          </svg>
        </button>
      ) : (
        <div className={styles.placeholder} role="status">
          {waveformState === 'loading'
            ? 'Decoding the recorded audio waveform…'
            : 'Waveform preview is unavailable for this browser codec. Audio playback is still available.'}
        </div>
      )}

      <div className={styles.timing} aria-hidden="true">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(mediaDuration)}</span>
      </div>
      <audio
        ref={audioRef}
        className={styles.audio}
        controls
        preload="metadata"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) setMediaDuration(event.currentTarget.duration);
        }}
        onEnded={() => setCurrentTime(0)}
      />
    </section>
  );
}
