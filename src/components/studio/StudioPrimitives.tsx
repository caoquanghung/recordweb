import type { ReactNode } from 'react';
import styles from './StudioShell.module.css';

export type StudioIconName =
  | 'record'
  | 'spark'
  | 'screen'
  | 'camera'
  | 'cameraOff'
  | 'mic'
  | 'micOff'
  | 'pause'
  | 'stop'
  | 'play'
  | 'cloud'
  | 'check'
  | 'refresh'
  | 'shield'
  | 'sun'
  | 'moon';

export function StudioIcon({ name }: { name: StudioIconName }) {
  const paths: Record<StudioIconName, ReactNode> = {
    record: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    spark: <><path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9L12 3Z"/><path d="m5 14 .7 2.3L8 17.5l-2.3 1.2L5 21l-.7-2.3L2 17.5l2.3-1.2L5 14ZM19 13l.5 1.7 1.5.8-1.5.8L19 18l-.5-1.7-1.5-.8 1.5-.8L19 13Z"/></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
    camera: <><path d="M15 8h4l2-2v12l-2-2h-4"/><rect x="3" y="6" width="12" height="12" rx="2"/></>,
    cameraOff: <><path d="M15 8h4l2-2v12l-2-2h-4"/><rect x="3" y="6" width="12" height="12" rx="2"/><path d="M2 2l20 20"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    micOff: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6M2 2l20 20"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    cloud: <path d="M7 18h11a4 4 0 0 0 .7-7.9A7 7 0 0 0 5.3 8.3 5 5 0 0 0 7 18Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20.2 15.5A8.5 8.5 0 0 1 8.5 3.8 8.5 8.5 0 1 0 20.2 15.5Z"/>,
  };

  return (
    <svg aria-hidden="true" className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return <span className={ok ? styles.statusDotOk : styles.statusDotIdle} />;
}
