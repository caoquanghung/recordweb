import type { StudioController } from './useStudioController';
import { StudioIcon } from './StudioPrimitives';
import styles from './StudioShell.module.css';

export function StudioHeader({ studio }: { studio: StudioController }) {
  const {
    theme,
    toggleTheme,
    healthState,
    runSystemCheck,
    setDiagnosticsOpen,
  } = studio;

  return (
    <header className={styles.topbar}>
      <div>
        <div className={styles.eyebrow}>RecordWeb studio</div>
        <h1>Recording workspace</h1>
      </div>
      <div className={styles.topbarActions}>
        <button
          className={styles.themeButton}
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          <StudioIcon name={theme === 'dark' ? 'sun' : 'moon'} />
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <div className={styles.privacyPill}><StudioIcon name="shield" /> Local until you upload</div>
        <button
          className={styles.secondaryButton}
          onClick={() => {
            setDiagnosticsOpen(true);
            if (healthState === 'idle') void runSystemCheck();
          }}
        >
          <StudioIcon name="shield" />
          Diagnostics
        </button>
      </div>
    </header>
  );
}

export function StudioToolbar({ studio }: { studio: StudioController }) {
  const {
    sourcesOpen,
    setSourcesOpen,
    effectsOpen,
    setEffectsOpen,
    sourcesConnected,
  } = studio;

  return (
    <div className={styles.workspaceToolbar}>
      <div className={styles.drawerActions} aria-label="Workspace panels">
        <button
          className={`${styles.drawerButton} ${sourcesOpen ? styles.drawerButtonActive : ''}`}
          onClick={() => {
            setSourcesOpen((value) => !value);
            if (!sourcesOpen && window.innerWidth < 1440) setEffectsOpen(false);
          }}
          aria-pressed={sourcesOpen}
        >
          <StudioIcon name="screen" /> Sources
        </button>
        <button
          className={`${styles.drawerButton} ${effectsOpen ? styles.drawerButtonActive : ''}`}
          onClick={() => {
            setEffectsOpen((value) => !value);
            if (!effectsOpen && window.innerWidth < 1440) setSourcesOpen(false);
          }}
          aria-pressed={effectsOpen}
        >
          <StudioIcon name="spark" /> Effects
        </button>
      </div>
      <div className={styles.liveSummary}>
        <span className={sourcesConnected ? styles.summaryReady : styles.summaryIdle} />
        {sourcesConnected ? 'Sources connected' : 'Connect sources to begin'}
      </div>
    </div>
  );
}

export function StudioSessionNotice({ studio }: { studio: StudioController }) {
  const {
    recoveryDrafts,
    recoveryMessage,
    recordingWarning,
    recordingError,
    recoverLatestDraft,
  } = studio;

  if (!recoveryDrafts.length && !recoveryMessage && !recordingWarning && !recordingError) return null;

  return (
    <div className={styles.sessionNotice} role="status">
      <div>
        <strong>
          {recoveryDrafts.length > 0
            ? `${recoveryDrafts.length} recoverable recording${recoveryDrafts.length === 1 ? '' : 's'} found`
            : recordingError ? 'Recording error' : 'Session update'}
        </strong>
        <span>{recordingError ?? recordingWarning ?? recoveryMessage ?? 'Restore the newest IndexedDB checkpoint.'}</span>
      </div>
      {recoveryDrafts.length > 0 && (
        <button type="button" onClick={() => void recoverLatestDraft()}>Recover latest</button>
      )}
    </div>
  );
}
