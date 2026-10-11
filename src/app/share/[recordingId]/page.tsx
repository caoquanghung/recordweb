import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, isDbConfigured } from '@/lib/db';
import type { DbRecording } from '@/types/database';
import styles from './share.module.css';

// Access checks depend on the current Clerk session and must run for each request.
export const instant = false;

interface AccessibleRecording extends DbRecording {
  access_permission: 'owner' | 'viewer' | 'viewer_download' | 'public';
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export default async function SharePage({ params }: PageProps<'/share/[recordingId]'>) {
  const { recordingId } = await params;
  const { userId } = await auth();

  if (!isDbConfigured) {
    return (
      <main className={styles.page}>
        <section className={styles.emptyState}>
          <span>RecordWeb</span>
          <h1>Sharing is temporarily unavailable</h1>
          <p>The recording database is not configured for this deployment.</p>
        </section>
      </main>
    );
  }

  const viewerId = userId ?? '';
  const sql = getDb();
  const rows = await sql`
    SELECT r.*,
      CASE
        WHEN r.user_id = ${viewerId} THEN 'owner'
        WHEN rs.permission IS NOT NULL THEN rs.permission
        ELSE 'public'
      END AS access_permission
    FROM recordings r
    LEFT JOIN recording_shares rs
      ON rs.recording_id = r.id AND rs.recipient_user_id = ${viewerId}
    WHERE r.id = ${recordingId}
      AND (
        r.is_public = TRUE
        OR r.user_id = ${viewerId}
        OR rs.recipient_user_id IS NOT NULL
      )
    LIMIT 1;
  `;

  if (rows.length === 0) notFound();

  const recording = rows[0] as AccessibleRecording;
  const canDownload = recording.access_permission === 'owner'
    || recording.access_permission === 'viewer_download';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>R</Link>
        <div>
          <span>Shared with RecordWeb</span>
          <strong>{recording.access_permission === 'public' ? 'Public link' : recording.access_permission.replace('_', ' ')}</strong>
        </div>
      </header>

      <article className={styles.card}>
        <div className={styles.heading}>
          <div>
            <span>Recording</span>
            <h1>{recording.title}</h1>
          </div>
          <div className={styles.metadata}>
            <span>{formatDuration(Number(recording.duration_seconds))}</span>
            <span>{recording.resolution}</span>
            <span>{recording.fps} FPS</span>
          </div>
        </div>

        {recording.storage_url ? (
          <video
            className={styles.video}
            src={recording.storage_url}
            controls
            controlsList={canDownload ? undefined : 'nodownload'}
            playsInline
            preload="metadata"
          />
        ) : (
          <div className={styles.emptyVideo}>This recording does not have an uploaded video.</div>
        )}

        <footer className={styles.footer}>
          <div>
            <strong>Created {new Date(recording.created_at).toLocaleDateString('en', { dateStyle: 'medium' })}</strong>
            {recording.mime_type.includes('webm') && (
              <span>WebM playback support varies on older Safari and iOS versions.</span>
            )}
          </div>
          {canDownload && recording.storage_url && (
            <a className={styles.download} href={recording.storage_url} download>Download video</a>
          )}
        </footer>
      </article>
    </main>
  );
}
