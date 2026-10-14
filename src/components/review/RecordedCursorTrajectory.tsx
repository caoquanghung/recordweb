'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CursorTrajectory, CursorTrajectorySample } from '@/types/recording';
import styles from './RecordedCursorTrajectory.module.css';

interface Props {
  blob: Blob;
}

function validTrajectory(value: unknown): value is CursorTrajectory {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CursorTrajectory>;
  return candidate.schemaVersion === 1
    && candidate.sampleRateHz === 24
    && Array.isArray(candidate.samples)
    && typeof candidate.timeline?.durationMs === 'number';
}

function pathSegments(samples: CursorTrajectorySample[]) {
  const stride = Math.max(1, Math.ceil(samples.length / 2400));
  const segments: string[] = [];
  let current = '';
  samples.forEach((sample, index) => {
    if (index % stride !== 0 && index !== samples.length - 1) return;
    if (!sample.visible || sample.x === null || sample.y === null) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    const x = sample.x * 1000;
    const y = sample.y * 562.5;
    current += `${current ? ' L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  if (current) segments.push(current);
  return segments;
}

export function RecordedCursorTrajectory({ blob }: Props) {
  const [trajectory, setTrajectory] = useState<CursorTrajectory | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void blob.text().then((text) => {
      const parsed: unknown = JSON.parse(text);
      if (!validTrajectory(parsed)) throw new Error('Unsupported cursor trajectory file.');
      if (!cancelled) setTrajectory(parsed);
    }).catch((cause) => {
      if (!cancelled) setError((cause as Error).message);
    });
    return () => { cancelled = true; };
  }, [blob]);

  const segments = useMemo(() => pathSegments(trajectory?.samples ?? []), [trajectory]);
  const lastVisible = useMemo(
    () => [...(trajectory?.samples ?? [])].reverse().find((sample) => sample.visible && sample.x !== null && sample.y !== null),
    [trajectory],
  );

  if (error) return <div className={styles.card}><p>{error}</p></div>;
  if (!trajectory) return <div className={styles.card}><p>Opening cursor trajectory…</p></div>;
  const sourceLabel = trajectory.tracking.mode === 'browser-extension-tab'
    ? trajectory.tracking.targetTitle
    : trajectory.tracking.displayLabel;

  return (
    <section className={styles.card} aria-label="Recorded cursor trajectory">
      <div className={styles.heading}>
        <div><span>Recorded cursor path</span><strong>{sourceLabel}</strong></div>
        <div><b>{trajectory.samples.length.toLocaleString()}</b><small>samples · 24 Hz</small></div>
      </div>
      <div className={styles.plot}>
        <svg viewBox="0 0 1000 562.5" role="img" aria-label="Normalized cursor path over the captured display">
          <defs><linearGradient id="cursor-path-gradient"><stop stopColor="#7c6df2"/><stop offset="1" stopColor="#42d6a4"/></linearGradient></defs>
          {segments.map((path, index) => <path key={`${index}-${path.length}`} d={path} />)}
          {lastVisible && <circle cx={lastVisible.x! * 1000} cy={lastVisible.y! * 562.5} r="9" />}
        </svg>
      </div>
      <div className={styles.meta}>
        <span>Active timeline {(trajectory.timeline.durationMs / 1000).toFixed(2)}s</span>
        <span>{trajectory.coordinateSpace.sourceWidth}×{trajectory.coordinateSpace.sourceHeight}</span>
        <span>Paused time excluded</span>
      </div>
    </section>
  );
}
