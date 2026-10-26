'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CursorTrajectory, CursorTrajectorySample } from '@/types/recording';
import styles from './RecordedCursorTrajectory.module.css';

interface Props { blob: Blob; }

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 562.5;
const TRAIL_DURATION_MS = 3000;
const MAX_SAMPLE_GAP_MS = (1000 / 24) * 3;

interface LegacyCursorTrajectorySample {
  index: number;
  timestampMs: number;
  x: number | null;
  y: number | null;
  visible: boolean;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseTrajectory(value: unknown): CursorTrajectory | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Omit<CursorTrajectory, 'schemaVersion' | 'samples'>> & {
    schemaVersion?: number;
    samples?: unknown[];
  };
  if ((candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2)
    || candidate.sampleRateHz !== 24
    || !Array.isArray(candidate.samples)
    || typeof candidate.timeline?.durationMs !== 'number') return null;

  const samples = candidate.samples.flatMap((sample, index) => {
    if (!sample || typeof sample !== 'object') return [];
    const legacySample = sample as CursorTrajectorySample | LegacyCursorTrajectorySample;
    if (!finiteNumber(legacySample.timestampMs)
      || !finiteNumber(legacySample.x)
      || !finiteNumber(legacySample.y)
      || legacySample.x < 0
      || legacySample.x > 1
      || legacySample.y < 0
      || legacySample.y > 1
      || ('visible' in legacySample && !legacySample.visible)) return [];
    return [{
      index,
      timestampMs: legacySample.timestampMs,
      x: legacySample.x,
      y: legacySample.y,
    }];
  });

  return { ...candidate, schemaVersion: 2, samples } as CursorTrajectory;
}

function pathSegments(samples: CursorTrajectorySample[], maximumPoints = 2400) {
  const stride = Math.max(1, Math.ceil(samples.length / maximumPoints));
  const segments: string[] = [];
  let current = '';
  let previousTimestamp: number | null = null;
  samples.forEach((sample, index) => {
    if (previousTimestamp !== null && sample.timestampMs - previousTimestamp > MAX_SAMPLE_GAP_MS) {
      if (current) segments.push(current);
      current = '';
    }
    previousTimestamp = sample.timestampMs;
    if (index % stride !== 0 && index !== samples.length - 1) return;
    const x = sample.x * VIEWBOX_WIDTH;
    const y = sample.y * VIEWBOX_HEIGHT;
    current += `${current ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  if (current) segments.push(current);
  return segments;
}

function findSampleIndex(samples: CursorTrajectorySample[], timeMs: number) {
  let low = 0;
  let high = samples.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].timestampMs <= timeMs) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

function cursorPosition(samples: CursorTrajectorySample[], index: number, timeMs: number) {
  const current = samples[index];
  if (!current || timeMs - current.timestampMs > MAX_SAMPLE_GAP_MS) return null;
  const next = samples[index + 1];
  if (!next
    || next.timestampMs <= current.timestampMs
    || next.timestampMs - current.timestampMs > MAX_SAMPLE_GAP_MS) {
    return { x: current.x, y: current.y };
  }
  const progress = Math.min(1, Math.max(0, (timeMs - current.timestampMs) / (next.timestampMs - current.timestampMs)));
  return { x: current.x + ((next.x - current.x) * progress), y: current.y + ((next.y - current.y) * progress) };
}

function formatTimestamp(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function RecordedCursorTrajectory({ blob }: Props) {
  const [trajectory, setTrajectory] = useState<CursorTrajectory | null>(null);
  const [error, setError] = useState('');
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const currentTimeRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void blob.text().then((text) => {
      const parsed: unknown = JSON.parse(text);
      const nextTrajectory = parseTrajectory(parsed);
      if (!nextTrajectory) throw new Error('Unsupported cursor trajectory file.');
      if (!cancelled) setTrajectory(nextTrajectory);
    }).catch((cause) => {
      if (!cancelled) setError((cause as Error).message);
    });
    return () => { cancelled = true; };
  }, [blob]);

  const durationMs = trajectory?.timeline.durationMs ?? 0;

  useEffect(() => {
    if (!isPlaying || durationMs <= 0) return;
    const wallClockStart = performance.now();
    const timelineStart = currentTimeRef.current;
    let animationFrame = 0;
    let lastPublishedAt = 0;
    const advance = (now: number) => {
      const nextTime = Math.min(durationMs, timelineStart + ((now - wallClockStart) * playbackRate));
      if (now - lastPublishedAt >= 1000 / 30 || nextTime >= durationMs) {
        currentTimeRef.current = nextTime;
        setCurrentTimeMs(nextTime);
        lastPublishedAt = now;
      }
      if (nextTime >= durationMs) {
        setIsPlaying(false);
        return;
      }
      animationFrame = requestAnimationFrame(advance);
    };
    animationFrame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(animationFrame);
  }, [durationMs, isPlaying, playbackRate]);

  const samples = useMemo(() => trajectory?.samples ?? [], [trajectory]);
  const allSegments = useMemo(() => pathSegments(samples), [samples]);
  const currentSampleIndex = useMemo(() => findSampleIndex(samples, currentTimeMs), [samples, currentTimeMs]);
  const position = useMemo(() => cursorPosition(samples, currentSampleIndex, currentTimeMs), [samples, currentSampleIndex, currentTimeMs]);
  const activeSegments = useMemo(() => {
    if (currentSampleIndex < 0) return [];
    const startIndex = Math.max(0, findSampleIndex(samples, Math.max(0, currentTimeMs - TRAIL_DURATION_MS)));
    return pathSegments(samples.slice(startIndex, currentSampleIndex + 1), 240);
  }, [samples, currentSampleIndex, currentTimeMs]);

  const seek = (timeMs: number) => {
    const boundedTime = Math.min(durationMs, Math.max(0, timeMs));
    currentTimeRef.current = boundedTime;
    setCurrentTimeMs(boundedTime);
  };

  const togglePlayback = () => {
    if (!isPlaying && currentTimeRef.current >= durationMs) seek(0);
    setIsPlaying((current) => !current);
  };

  if (error) return <div className={styles.card}><p>{error}</p></div>;
  if (!trajectory) return <div className={styles.card}><p>Opening cursor trajectory…</p></div>;
  const sourceLabel = trajectory.tracking.mode === 'browser-extension-tab'
    ? trajectory.tracking.targetTitle
    : trajectory.tracking.mode === 'recordweb-presentation'
      ? trajectory.tracking.presentationTitle
      : trajectory.tracking.displayLabel;

  return (
    <section className={styles.card} aria-label="Recorded cursor trajectory">
      <div className={styles.heading}>
        <div><span>Cursor trajectory player</span><strong>{sourceLabel}</strong></div>
        <div><b>{trajectory.samples.length.toLocaleString()}</b><small>samples · 24 Hz</small></div>
      </div>
      <div className={styles.plot}>
        <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="img" aria-label={`Cursor position at ${formatTimestamp(currentTimeMs)}`}>
          <defs>
            <linearGradient id="cursor-path-gradient"><stop stopColor="var(--primary-bright)"/><stop offset="1" stopColor="#42d6a4"/></linearGradient>
            <linearGradient id="cursor-trail-gradient"><stop stopColor="var(--primary-bright)"/><stop offset="1" stopColor="#61f3bd"/></linearGradient>
          </defs>
          {allSegments.map((path, index) => <path className={styles.fullPath} key={`full-${index}-${path.length}`} d={path} />)}
          {activeSegments.map((path, index) => <path className={styles.activePath} key={`active-${index}-${path.length}`} d={path} />)}
          {position && <g transform={`translate(${position.x * VIEWBOX_WIDTH} ${position.y * VIEWBOX_HEIGHT})`}><circle className={styles.cursorHalo} r="18"/><circle className={styles.cursorDot} r="7"/></g>}
        </svg>
        <span className={styles.timeBadge}>{formatTimestamp(currentTimeMs)}</span>
      </div>
      <div className={styles.controls}>
        <button type="button" onClick={togglePlayback} disabled={durationMs <= 0} aria-label={isPlaying ? 'Pause cursor animation' : 'Play cursor animation'}>{isPlaying ? 'Pause' : currentTimeMs >= durationMs && durationMs > 0 ? 'Replay' : 'Play'}</button>
        <input type="range" min="0" max={Math.max(1, durationMs)} step="1" value={currentTimeMs} onChange={(event) => seek(Number(event.target.value))} aria-label="Cursor animation timeline"/>
        <span className={styles.duration}>{formatTimestamp(currentTimeMs)} / {formatTimestamp(durationMs)}</span>
        <div className={styles.rates} aria-label="Playback speed">{[1, 2, 4].map((rate) => <button key={rate} type="button" className={playbackRate === rate ? styles.rateActive : ''} onClick={() => setPlaybackRate(rate)}>{rate}×</button>)}</div>
      </div>
      <div className={styles.meta}>
        <span>Active timeline {(durationMs / 1000).toFixed(2)}s</span>
        <span>{trajectory.coordinateSpace.sourceWidth}×{trajectory.coordinateSpace.sourceHeight}</span>
        <span>Normalized coordinates · paused time excluded</span>
      </div>
    </section>
  );
}
