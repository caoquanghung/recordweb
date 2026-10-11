'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WorkspaceShell } from '@/components/app/WorkspaceShell';
import { getAllLocalRecordings, getRecordingDrafts } from '@/lib/idb';
import type { DbRecording, DbStudioPreset } from '@/types/database';
import styles from './DashboardClient.module.css';

const quickStarts = [
  { title: 'Presentation', detail: 'Screen, camera, and voice clarity', mode: 'screen-pip', background: 'blur', audioMode: 'Voice clarity' },
  { title: 'Coding tutorial', detail: 'Screen-first with a compact camera', mode: 'screen-pip', background: 'original', audioMode: 'Natural' },
  { title: 'Webcam message', detail: 'Camera-only with a clean background', mode: 'webcam-only', background: 'blur', audioMode: 'Voice clarity' },
  { title: 'Product demo', detail: 'Screen and presenter cutout', mode: 'screen-pip', background: 'cutout', audioMode: 'Podcast' },
  { title: 'Online lecture', detail: 'Screen capture with noise reduction', mode: 'screen-pip', background: 'blur', audioMode: 'Noise reduction' },
];

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function DashboardClient() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<DbRecording[]>([]);
  const [presets, setPresets] = useState<DbStudioPreset[]>([]);
  const [localCount, setLocalCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [recordingResponse, presetResponse, local, drafts] = await Promise.all([
        fetch('/api/recordings', { cache: 'no-store' }),
        fetch('/api/presets', { cache: 'no-store' }),
        getAllLocalRecordings(),
        getRecordingDrafts(),
      ]);
      const recordingData = await recordingResponse.json();
      const presetData = await presetResponse.json();
      if (!recordingResponse.ok) throw new Error(recordingData.error ?? 'Could not load recordings.');
      if (!presetResponse.ok) throw new Error(presetData.error ?? 'Could not load presets.');
      setRecordings(recordingData.recordings ?? []);
      setPresets(presetData.presets ?? []);
      setLocalCount(local.length);
      setDraftCount(drafts.length);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadDashboard]);

  const cloudBytes = useMemo(
    () => recordings.reduce((total, recording) => total + Number(recording.file_size_bytes || 0), 0),
    [recordings],
  );

  const startQuickRecording = (configuration: typeof quickStarts[number]) => {
    localStorage.setItem('recordweb-quick-start', JSON.stringify(configuration));
    router.push('/');
  };

  const openPresetInStudio = (preset: DbStudioPreset) => {
    localStorage.setItem('recordweb-pending-preset', JSON.stringify(preset));
    router.push('/');
  };

  const deletePreset = async (id: string) => {
    if (!window.confirm('Delete this saved preset?')) return;
    const response = await fetch('/api/presets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? 'Could not delete preset.');
      return;
    }
    setPresets((current) => current.filter((preset) => preset.id !== id));
    setMessage('Preset deleted.');
  };

  return (
    <WorkspaceShell
      active="dashboard"
      eyebrow="RecordWeb workspace"
      title="Dashboard"
      description="Start quickly, resume recoverable work, and keep an eye on local and cloud recordings."
      actions={<Link className={styles.primaryAction} href="/">New recording</Link>}
    >
      {draftCount > 0 && (
        <section className={styles.recoveryBanner}>
          <div><strong>{draftCount} interrupted recording{draftCount === 1 ? '' : 's'} can be recovered</strong><span>Open Studio to repair and save the latest local checkpoint.</span></div>
          <Link href="/">Recover in Studio</Link>
        </section>
      )}

      {message && <p className={styles.message} role="status">{message}</p>}

      <section className={styles.statsGrid} aria-label="Workspace summary">
        <article><span>Cloud recordings</span><strong>{loading ? '—' : recordings.length}</strong><small>Saved in Neon + Blob</small></article>
        <article><span>Local recordings</span><strong>{loading ? '—' : localCount}</strong><small>Available in this browser</small></article>
        <article><span>Cloud storage</span><strong>{loading ? '—' : `${(cloudBytes / 1024 / 1024).toFixed(1)} MB`}</strong><small>Recorded file metadata</small></article>
        <article><span>Saved presets</span><strong>{loading ? '—' : presets.length}</strong><small>Reusable studio setups</small></article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><span>Quick start</span><h2>Choose a recording workflow</h2></div></div>
        <div className={styles.quickGrid}>
          {quickStarts.map((item, index) => (
            <button key={item.title} onClick={() => startQuickRecording(item)}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div><span>Recent</span><h2>Cloud recordings</h2></div>
            <Link href="/library">Open library</Link>
          </div>
          <div className={styles.list}>
            {!loading && recordings.length === 0 && <p className={styles.empty}>No cloud recordings yet. Your local recording stays private until you upload it.</p>}
            {recordings.slice(0, 5).map((recording) => (
              <Link className={styles.listRow} href={`/share/${recording.id}`} key={recording.id}>
                <span className={styles.formatBadge}>{recording.mime_type.includes('mp4') ? 'MP4' : 'WEBM'}</span>
                <div><strong>{recording.title}</strong><small>{new Date(recording.created_at).toLocaleDateString()} · {recording.resolution}</small></div>
                <span>{formatDuration(Number(recording.duration_seconds))}</span>
                <em>{recording.is_public ? 'Public' : 'Private'}</em>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}><div><span>Presets</span><h2>Saved setups</h2></div></div>
          <div className={styles.list}>
            {!loading && presets.length === 0 && <p className={styles.empty}>Save a setup from the Studio Effects panel to reuse it here.</p>}
            {presets.slice(0, 5).map((preset) => (
              <div className={styles.presetRow} key={preset.id}>
                <div><strong>{preset.preset_name}</strong><small>{preset.pip_shape} · {preset.pip_size} · {preset.bg_removal_mode}</small></div>
                <button onClick={() => openPresetInStudio(preset)}>Use</button>
                <button className={styles.dangerText} onClick={() => void deletePreset(preset.id)}>Delete</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
