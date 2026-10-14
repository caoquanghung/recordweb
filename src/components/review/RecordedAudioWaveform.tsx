'use client';

import { useId, useMemo } from 'react';
import type { MouseEvent } from 'react';
import { RECORDED_WAVEFORM_PEAK_COUNT } from '@/lib/audioWaveform';
import { useRecordedAudioWaveform } from './useRecordedAudioWaveform';
import styles from './RecordedAudioWaveform.module.css';

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 160;
const BAR_WIDTH = 6;
const BAR_GAP = VIEWBOX_WIDTH / RECORDED_WAVEFORM_PEAK_COUNT;
const MIN_BAR_HEIGHT = 4;

interface RecordedAudioWaveformProps {
  blob?: Blob;
  src?: string;
  durationSeconds: number;
  mimeType: string;
  peaks?: number[];
  compact?: boolean;
  title?: string;
  description?: string;
  onPeaksReady?: (peaks: number[]) => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function RecordedAudioWaveform({
  blob,
  src,
  durationSeconds,
  mimeType,
  peaks: storedPeaks,
  compact = false,
  title = 'Audio master',
  description,
  onPeaksReady,
}: RecordedAudioWaveformProps) {
  const clipId = `recorded-waveform-${useId().replaceAll(':', '')}`;
  const {
    audioRef,
    currentTime,
    duration,
    peaks,
    progress,
    waveformState,
    seekToFraction,
    setCurrentTime,
    updateDuration,
    resetCurrentTime,
  } = useRecordedAudioWaveform({
    blob,
    src,
    durationSeconds,
    storedPeaks,
    onPeaksReady,
  });
  const bars = useMemo(() => peaks.map((peak, index) => {
    const height = Math.max(MIN_BAR_HEIGHT, peak * (VIEWBOX_HEIGHT - 24));
    return {
      height,
      key: index,
      x: index * BAR_GAP + (BAR_GAP - BAR_WIDTH) / 2,
      y: (VIEWBOX_HEIGHT - height) / 2,
    };
  }), [peaks]);

  const seekFromWaveform = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    seekToFraction((event.clientX - bounds.left) / bounds.width);
  };

  return (
    <section className={`${styles.card} ${compact ? styles.compact : ''}`} aria-label="Recorded audio waveform">
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.icon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 13v-2M8 17V7M12 20V4M16 16V8M20 14v-4" />
            </svg>
          </span>
          <div>
            <strong>{title}</strong>
            <span>{description ?? `${mimeType.split(';')[0]} · waveform decoded from the recorded file`}</span>
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
        <span>{formatTime(duration)}</span>
      </div>
      <audio
        ref={audioRef}
        className={styles.audio}
        controls
        preload="metadata"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => updateDuration(event.currentTarget.duration)}
        onEnded={resetCurrentTime}
      />
    </section>
  );
}
