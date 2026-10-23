import { StatusDot, StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioDiagnosticsDrawer.module.css';

export function StudioDiagnosticsDrawer({ studio }: { studio: StudioController }) {
  const {
    diagnosticsOpen,
    setDiagnosticsOpen,
    health,
    capabilities,
    runSystemCheck,
    healthState,
  } = studio;

  if (!diagnosticsOpen) return null;

  return (
    <div className={styles.drawerBackdrop} role="presentation" onMouseDown={() => setDiagnosticsOpen(false)}>
      <aside className={styles.diagnosticsDrawer} role="dialog" aria-modal="true" aria-labelledby="diagnostics-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.diagnosticsHeader}>
          <div><span>Preflight</span><h2 id="diagnostics-title">System diagnostics</h2><p>Confirm browser and cloud readiness before recording.</p></div>
          <button onClick={() => setDiagnosticsOpen(false)} aria-label="Close diagnostics">×</button>
        </div>
        <div className={styles.diagnosticsList}>
          <div><StatusDot ok={health?.auth === 'authenticated'} /><span>Clerk session</span><strong>{health?.auth === 'authenticated' ? 'Connected' : 'Not checked'}</strong></div>
          <div><StatusDot ok={health?.database === 'connected'} /><span>Neon database</span><strong>{health?.database ?? 'Not checked'}</strong></div>
          <div><StatusDot ok={health?.blob === 'configured'} /><span>Vercel Blob</span><strong>{health?.blob ?? 'Not checked'}</strong></div>
          <div><StatusDot ok={Boolean(capabilities?.screenCapture)} /><span>Screen capture</span><strong>{capabilities ? (capabilities.screenCapture ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
          <div><StatusDot ok={Boolean(capabilities?.cameraAndMic)} /><span>Camera and microphone</span><strong>{capabilities ? (capabilities.cameraAndMic ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
          <div><StatusDot ok={Boolean(capabilities?.mediaRecorder)} /><span>MediaRecorder</span><strong>{capabilities ? (capabilities.mediaRecorder ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
          <div><StatusDot ok={Boolean(capabilities?.indexedDb)} /><span>Local recovery</span><strong>{capabilities ? (capabilities.indexedDb ? 'Supported' : 'Unavailable') : 'Not checked'}</strong></div>
          <div><StatusDot ok={Boolean(capabilities?.fileSystemSave)} /><span>Direct file save</span><strong>{capabilities ? (capabilities.fileSystemSave ? 'Supported' : 'Download fallback') : 'Not checked'}</strong></div>
        </div>
        <button className={styles.diagnosticsRefresh} onClick={() => void runSystemCheck()} disabled={healthState === 'checking'}>
          <StudioIcon name="refresh" /> {healthState === 'checking' ? 'Checking…' : 'Run checks again'}
        </button>
      </aside>
    </div>
  );
}
