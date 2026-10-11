'use client';

import { useMediaSession } from './MediaSessionProvider';
import styles from './GlobalMediaControl.module.css';

type SourceName = 'screen' | 'camera' | 'microphone';

function SourceIcon({ source }: { source: SourceName }) {
  if (source === 'microphone') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="3" width="8" height="12" rx="4" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
      </svg>
    );
  }

  if (source === 'camera') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="13" height="12" rx="3" />
        <path d="m16 10 5-3v10l-5-3" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function GlobalMediaControl() {
  const {
    screenStream,
    cameraStream,
    microphoneStream,
    stopScreen,
    stopCamera,
    stopMicrophone,
    stopAll,
  } = useMediaSession();

  const sources = [
    { source: 'screen' as const, label: 'Screen', stream: screenStream, stop: stopScreen },
    { source: 'camera' as const, label: 'Camera', stream: cameraStream, stop: stopCamera },
    { source: 'microphone' as const, label: 'Mic', stream: microphoneStream, stop: stopMicrophone },
  ].filter(({ stream }) => Boolean(stream));

  if (sources.length === 0) return null;

  return (
    <aside className={styles.control} aria-label="Active media sources">
      <div className={styles.heading}>
        <span className={styles.liveDot} aria-hidden="true" />
        <span>Devices in use</span>
      </div>
      <div className={styles.sources}>
        {sources.map(({ source, label, stop }) => (
          <button
            className={styles.sourceButton}
            key={source}
            type="button"
            onClick={stop}
            aria-label={`Disconnect ${label.toLowerCase()}`}
            title={`Disconnect ${label.toLowerCase()}`}
          >
            <SourceIcon source={source} />
            <span>{label}</span>
            <span className={styles.close} aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <button className={styles.disconnectAll} type="button" onClick={stopAll}>
        Disconnect all
      </button>
    </aside>
  );
}
