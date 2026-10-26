import type { CSSProperties } from 'react';
import type { AudioDspState } from '@/hooks/useAudioDSP';
import styles from './AudioLevelMeter.module.css';

interface AudioLevelMeterProps {
  label: string;
  level: number;
  levelDb: number;
  state: AudioDspState;
  hasInput: boolean;
  compact?: boolean;
  minimal?: boolean;
  tone?: 'microphone' | 'system' | 'mixed';
}

export function AudioLevelMeter({
  label,
  level,
  levelDb,
  state,
  hasInput,
  compact = false,
  minimal = false,
  tone = 'mixed',
}: AudioLevelMeterProps) {
  const percentage = Math.round(level * 100);
  const status = !hasInput
    ? 'Not connected'
    : state === 'running'
      ? `${Math.max(-60, Math.round(levelDb))} dB`
      : state;
  const meterStyle = {
    '--audio-level': `${level * 100}%`,
  } as CSSProperties;

  return (
    <div className={`${styles.meter} ${compact ? styles.compact : ''} ${minimal ? styles.minimal : ''}`} title={`${label}: ${status}`}>
      <div className={styles.header}>
        <span>{minimal ? label === 'Microphone' ? 'Mic' : 'Tab' : label}</span>
        {!minimal && <small>{status}</small>}
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label={`${label} level${hasInput ? '' : ', not connected'}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <span className={styles[tone]} style={meterStyle} />
      </div>
    </div>
  );
}
