'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import {
  decodeRecordedWaveform,
  isRecordedWaveformPeaks,
  RECORDED_WAVEFORM_PEAK_COUNT,
} from '@/lib/audioWaveform';
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
  onPeaksReady,
}: RecordedAudioWaveformProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<SVGSVGElement | null>(null);
  const clipId = `recorded-waveform-${useId().replaceAll(':', '')}`;
  const [decodedPeaks, setDecodedPeaks] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(durationSeconds);
  const [waveformState, setWaveformState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

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
    if (isRecordedWaveformPeaks(storedPeaks)) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const decodeRecordedAudio = async () => {
      setWaveformState('loading');
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
        setWaveformState('ready');
        onPeaksReady?.(decoded.peaks);
      } catch {
        if (!cancelled) setWaveformState('unavailable');
      }
    };

    void decodeRecordedAudio();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [blob, durationSeconds, onPeaksReady, src, storedPeaks]);

  const peaks = isRecordedWaveformPeaks(storedPeaks) ? storedPeaks : decodedPeaks;
  const effectiveDuration = isRecordedWaveformPeaks(storedPeaks) ? durationSeconds : mediaDuration;
  const effectiveWaveformState = isRecordedWaveformPeaks(storedPeaks) ? 'ready' : waveformState;
  const progress = effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;
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
    if (!audio || !effectiveDuration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextTime = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * effectiveDuration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
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
            <strong>Audio master</strong>
            <span>{mimeType.split(';')[0]} · waveform decoded from the recorded file</span>
          </div>
        </div>
        <span className={styles.status}>Recorded waveform</span>
      </div>

      {effectiveWaveformState === 'ready' ? (
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
          {effectiveWaveformState === 'loading'
            ? 'Decoding the recorded audio waveform…'
            : 'Waveform preview is unavailable for this browser codec. Audio playback is still available.'}
        </div>
      )}

      <div className={styles.timing} aria-hidden="true">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(effectiveDuration)}</span>
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
