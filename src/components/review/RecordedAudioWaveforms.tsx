'use client';

import { useState } from 'react';
import { RecordedAudioWaveform } from './RecordedAudioWaveform';
import styles from './RecordedAudioWaveforms.module.css';

export interface RecordedWaveformSource {
  blob?: Blob;
  src?: string;
  mimeType: string;
  waveformPeaks?: number[];
}

interface RecordedAudioWaveformsProps {
  durationSeconds: number;
  mixed?: RecordedWaveformSource;
  microphone?: RecordedWaveformSource;
  systemAudio?: RecordedWaveformSource;
  compact?: boolean;
}

interface WaveformEntry {
  key: 'microphone' | 'system';
  label: string;
  description: string;
  asset: RecordedWaveformSource;
}

export function RecordedAudioWaveforms({
  durationSeconds,
  mixed,
  microphone,
  systemAudio,
  compact = false,
}: RecordedAudioWaveformsProps) {
  const [showSources, setShowSources] = useState(false);
  if (!mixed?.blob && !mixed?.src) return null;

  const sourceWaveforms: WaveformEntry[] = [
    microphone?.blob || microphone?.src ? {
      key: 'microphone',
      label: 'Microphone',
      description: 'Processed microphone source',
      asset: microphone,
    } : null,
    systemAudio?.blob || systemAudio?.src ? {
      key: 'system',
      label: 'System audio',
      description: 'System audio source after volume control',
      asset: systemAudio,
    } : null,
  ].filter((entry): entry is WaveformEntry => entry !== null);

  return (
    <section className={styles.collection} aria-label="Recorded audio waveforms">
      <RecordedAudioWaveform
        blob={mixed.blob}
        src={mixed.src}
        durationSeconds={durationSeconds}
        mimeType={mixed.mimeType}
        peaks={mixed.waveformPeaks}
        title="Mixed audio"
        description="Microphone and system audio master"
        compact={compact}
      />
      {sourceWaveforms.length > 0 && (
        <div className={styles.sourceSection}>
          <button
            className={styles.toggle}
            type="button"
            onClick={() => setShowSources((current) => !current)}
            aria-expanded={showSources}
          >
            <span>{showSources ? 'Hide source waveforms' : 'Show source waveforms'}</span>
            <small>{sourceWaveforms.length} available</small>
          </button>
          {showSources && (
            <div className={styles.sourceGrid}>
              {sourceWaveforms.map(({ key, label, description, asset }) => (
                <div className={styles.sourceWaveform} key={key}>
                  <span>{label}</span>
                  <RecordedAudioWaveform
                    blob={asset.blob}
                    src={asset.src}
                    durationSeconds={durationSeconds}
                    mimeType={asset.mimeType}
                    peaks={asset.waveformPeaks}
                    title={label}
                    description={description}
                    compact
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
