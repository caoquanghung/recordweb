'use client';

import { useEffect, useState } from 'react';
import { WorkspaceShell } from '@/components/app/WorkspaceShell';
import { useAppTheme } from '@/components/app/useAppTheme';
import { Can } from '@/components/auth/PermissionProvider';
import { getAllLocalRecordings, getRecordingDrafts } from '@/lib/idb';
import styles from './SettingsClient.module.css';

interface HealthResponse {
  auth: 'authenticated';
  database: 'connected' | 'not-configured' | 'error';
  blob: 'configured' | 'not-configured';
  checkedAt: string;
}

export function SettingsClient() {
  const { theme, setTheme } = useAppTheme();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [localStats, setLocalStats] = useState({ recordings: 0, drafts: 0, bytes: 0 });

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      void Promise.all([getAllLocalRecordings(), getRecordingDrafts()])
        .then(([recordings, drafts]) => setLocalStats({
          recordings: recordings.length,
          drafts: drafts.length,
          bytes: recordings.reduce((total, recording) => total + recording.fileSizeBytes, 0),
        }))
        .catch((error) => setMessage(`Could not inspect local storage: ${(error as Error).message}`));
    }, 0);
    return () => window.clearTimeout(initialize);
  }, []);

  const selectTheme = (nextTheme: 'light' | 'dark') => {
    setTheme(nextTheme);
    setMessage(`${nextTheme === 'light' ? 'Light' : 'Dark'} theme selected.`);
  };

  const runHealthCheck = async () => {
    setChecking(true);
    setMessage('');
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok && response.status !== 503) throw new Error(data.error ?? 'Health check failed.');
      setHealth(data);
      setMessage(response.ok ? 'Cloud connections are ready.' : 'One or more cloud services need attention.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <WorkspaceShell
      active="settings"
      eyebrow="Workspace preferences"
      title="Settings"
      description="Control appearance, inspect local storage, and confirm that authentication and cloud services are available."
    >
      {message && <p className={styles.message} role="status">{message}</p>}
      <div className={styles.settingsGrid}>
        <section className={styles.card}>
          <div className={styles.cardHeading}><div><span>Appearance</span><h2>Color theme</h2></div><em>Saved locally</em></div>
          <p>Choose the interface theme used across Studio, Dashboard, Library, and Settings.</p>
          <div className={styles.themeChoices}>
            <button className={theme === 'dark' ? styles.choiceActive : ''} onClick={() => selectTheme('dark')}><span className={styles.darkPreview} /><strong>Dark studio</strong><small>Low-glare recording workspace</small></button>
            <button className={theme === 'light' ? styles.choiceActive : ''} onClick={() => selectTheme('light')}><span className={styles.lightPreview} /><strong>Light workspace</strong><small>Bright neutral interface</small></button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeading}><div><span>Browser storage</span><h2>Local recordings</h2></div><em>This device only</em></div>
          <p>Local recordings and recovery checkpoints stay inside this browser profile.</p>
          <div className={styles.storageStats}>
            <div><strong>{localStats.recordings}</strong><span>Final recordings</span></div>
            <div><strong>{localStats.drafts}</strong><span>Recovery drafts</span></div>
            <div><strong>{(localStats.bytes / 1024 / 1024).toFixed(1)} MB</strong><span>Finalized media</span></div>
          </div>
          <small className={styles.note}>Clearing browser site data also removes IndexedDB recordings that have not been downloaded or uploaded.</small>
        </section>

        <Can permission="diagnostics:internal">
          <section className={`${styles.card} ${styles.wideCard}`}>
            <div className={styles.cardHeading}><div><span>Cloud diagnostics</span><h2>Service connections</h2></div><button onClick={() => void runHealthCheck()} disabled={checking}>{checking ? 'Checking…' : 'Run check'}</button></div>
            <p>These checks confirm configuration and connectivity without exposing credentials to the browser.</p>
            <div className={styles.serviceList}>
              <div><i className={health?.auth === 'authenticated' ? styles.ready : ''} /><span>Clerk authentication</span><strong>{health ? 'Authenticated' : 'Not checked'}</strong></div>
              <div><i className={health?.database === 'connected' ? styles.ready : ''} /><span>Neon database</span><strong>{health?.database ?? 'Not checked'}</strong></div>
              <div><i className={health?.blob === 'configured' ? styles.ready : ''} /><span>Vercel Blob</span><strong>{health?.blob ?? 'Not checked'}</strong></div>
            </div>
          </section>
        </Can>

        <section className={`${styles.card} ${styles.wideCard}`}>
          <div className={styles.cardHeading}><div><span>Privacy model</span><h2>Where your data goes</h2></div><em>Client-first</em></div>
          <div className={styles.privacyGrid}>
            <div><strong>During recording</strong><p>Camera, screen, AI background effects, audio DSP, and encoding run inside your browser.</p></div>
            <div><strong>Local recovery</strong><p>One-second recording checkpoints and completed local recordings are saved in IndexedDB.</p></div>
            <div><strong>Cloud upload</strong><p>Video leaves the device only after you choose Upload. The browser sends it directly to Vercel Blob.</p></div>
            <div><strong>Sharing</strong><p>Neon stores metadata and access grants. Current Blob objects use public URLs, so do not upload sensitive media yet.</p></div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
