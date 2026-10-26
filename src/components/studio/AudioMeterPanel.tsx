'use client';

import { useState } from 'react';
import type { AudioDspState } from '@/hooks/useAudioDSP';
import { AudioLevelMeter } from './AudioLevelMeter';
import styles from './AudioMeterPanel.module.css';

interface AudioMeterReading {
  level: number;
  levelDb: number;
  available: boolean;
}

interface AudioMeterPanelProps {
  microphone: AudioMeterReading;
  systemAudio: AudioMeterReading;
  state: AudioDspState;
  compact?: boolean;
  minimal?: boolean;
  onResume?: () => void;
}

export function AudioMeterPanel({
  microphone,
  systemAudio,
  state,
  compact = false,
  minimal = false,
  onResume,
}: AudioMeterPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const combinedLevel = Math.max(microphone.level, systemAudio.level);
  const percentage = Math.round(combinedLevel * 100);
  const meters = (
    <>
      <AudioLevelMeter
        label="Microphone"
        level={microphone.level}
        levelDb={microphone.levelDb}
        state={state}
        hasInput={microphone.available}
        compact={compact}
        minimal={minimal}
        tone="microphone"
      />
      <AudioLevelMeter
        label="System audio"
        level={systemAudio.level}
        levelDb={systemAudio.levelDb}
        state={state}
        hasInput={systemAudio.available}
        compact={compact}
        minimal={minimal}
        tone="system"
      />
    </>
  );

  if (minimal) {
    return (
      <section className={`${styles.panel} ${styles.minimal}`} aria-label="Live audio levels">
        <div className={styles.minimalHeading}>
          <strong>Audio activity</strong>
          {state === 'suspended' && onResume && <button type="button" onClick={onResume}>Start audio</button>}
        </div>
        <div className={styles.minimalMeters}>{meters}</div>
      </section>
    );
  }

  if (compact && collapsed) {
    return (
      <div className={`${styles.panel} ${styles.collapsed}`}>
        <button
          className={styles.soundIndicator}
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand microphone and system audio meters"
          title="Expand audio meters"
        >
          <span className={styles.soundLabel}>Audio</span>
          <span
            className={styles.indicatorTrack}
            role="meter"
            aria-label="Combined live audio activity"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <i style={{ transform: `scaleX(${combinedLevel})` }} />
          </span>
          <span className={styles.expandGlyph} aria-hidden="true">›</span>
        </button>
      </div>
    );
  }

  return (
    <section className={`${styles.panel} ${compact ? styles.compact : ''}`} aria-label="Live audio levels">
      <div className={styles.heading}>
        <div>
          <strong>Audio levels</strong>
          {!compact && <span>Processed signals sent to the recorder</span>}
        </div>
        {compact ? (
          <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse audio meters">
            Collapse
          </button>
        ) : state === 'suspended' && onResume ? (
          <button type="button" onClick={onResume}>
            Start audio
          </button>
        ) : null}
      </div>
      <div className={styles.meters}>
        {meters}
      </div>
    </section>
  );
}
