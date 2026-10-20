import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useAppTheme } from '@/components/app/useAppTheme';
import type { StudioController } from './useStudioController';
import { StudioIcon } from './StudioPrimitives';
import styles from './StudioShell.module.css';

interface StudioHeaderProps {
  studio: StudioController;
  eyebrow?: string;
  title?: string;
  integratedPresentation?: boolean;
  onReturnToRecording?: () => void;
}

export function StudioHeader({
  studio,
  eyebrow = 'RecordWeb studio',
  title = 'Recording workspace',
  integratedPresentation = false,
  onReturnToRecording,
}: StudioHeaderProps) {
  const { theme, toggleTheme } = useAppTheme();
  const {
    healthState,
    runSystemCheck,
    setDiagnosticsOpen,
  } = studio;

  if (studio.workspace === 'studio' || integratedPresentation) {
    return (
      <header className={`${styles.topbar} ${styles.studioTopbar}`}>
        <Link className={styles.studioBrand} href="/dashboard" aria-label="Mở bảng điều khiển RecordWeb">
          <span className={styles.studioBrandMark}><StudioIcon name="screen" /></span>
          <span>
            <strong>{integratedPresentation ? 'RecordWeb Trình chiếu' : 'RecordWeb Studio'}</strong>
            <small>{integratedPresentation ? 'PDF / PPTX trong phòng thu' : 'Phòng thu bài giảng số'}</small>
          </span>
        </Link>
        <div className={styles.topbarActions}>
          <span className={styles.studioReady}><i /> Sẵn sàng ghi hình</span>
          {integratedPresentation && (
            <button
              className={styles.studioBackButton}
              type="button"
              onClick={onReturnToRecording}
              disabled={studio.session !== 'setup'}
              title={studio.session === 'setup' ? 'Quay lại chế độ ghi màn hình' : 'Hoàn tất phiên hiện tại trước khi chuyển chế độ'}
            >
              ← Ghi màn hình
            </button>
          )}
          <Link className={styles.studioDashboardLink} href="/dashboard">Bảng điều khiển</Link>
          <button
            className={styles.themeButton}
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <StudioIcon name={theme === 'dark' ? 'sun' : 'moon'} />
            <span>{theme === 'dark' ? 'Sáng' : 'Tối'}</span>
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => {
              setDiagnosticsOpen(true);
              if (healthState === 'idle') void runSystemCheck();
            }}
          >
            <StudioIcon name="shield" /> Kiểm tra
          </button>
          <UserButton />
        </div>
      </header>
    );
  }

  return (
    <header className={styles.topbar}>
      <div>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <h1>{title}</h1>
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

interface StudioToolbarProps {
  studio: StudioController;
  sourcesLabel?: string;
  connectedLabel?: string;
  idleLabel?: string;
  onOpenPresentation?: () => void;
  integratedPresentation?: boolean;
}

export function StudioToolbar({
  studio,
  sourcesLabel = 'Sources',
  connectedLabel = 'Sources connected',
  idleLabel = 'Connect sources to begin',
  onOpenPresentation,
  integratedPresentation = false,
}: StudioToolbarProps) {
  const {
    sourcesOpen,
    setSourcesOpen,
    effectsOpen,
    setEffectsOpen,
    sourcesConnected,
  } = studio;

  if (studio.workspace === 'studio' || integratedPresentation) {
    return (
      <div className={`${styles.workspaceToolbar} ${styles.studioSessionBar}`}>
        <div className={styles.studioSessionTitle}>
          <StudioIcon name={integratedPresentation ? 'cloud' : 'camera'} />
          <span>{integratedPresentation ? 'Chế độ trình chiếu:' : 'Phiên ghi hình:'}</span>
          <strong>{integratedPresentation ? 'Tệp PDF / PPTX' : 'Bài giảng mới'}</strong>
        </div>
        <div className={styles.studioSessionActions}>
          {!integratedPresentation && (
            <button
              className={styles.presentationModeButton}
              type="button"
              onClick={onOpenPresentation}
              disabled={studio.session !== 'setup'}
              title={studio.session === 'setup' ? 'Mở chế độ trình chiếu PDF hoặc PPTX' : 'Hoàn tất phiên hiện tại trước khi chuyển chế độ'}
            >
              <StudioIcon name="cloud" /> Tải PDF / PPTX
            </button>
          )}
          <div className={styles.liveSummary}>
            <span className={sourcesConnected ? styles.summaryReady : styles.summaryIdle} />
            {sourcesConnected ? connectedLabel : idleLabel}
          </div>
          <div className={styles.drawerActions} aria-label="Workspace panels">
            <button
              className={`${styles.drawerButton} ${sourcesOpen ? styles.drawerButtonActive : ''}`}
              onClick={() => {
                setSourcesOpen((value) => !value);
                if (!sourcesOpen && window.innerWidth < 1120) setEffectsOpen(false);
              }}
              aria-pressed={sourcesOpen}
            >
              <StudioIcon name="screen" /> Thiết bị
            </button>
            <button
              className={`${styles.drawerButton} ${effectsOpen ? styles.drawerButtonActive : ''}`}
              onClick={() => {
                setEffectsOpen((value) => !value);
                if (!effectsOpen && window.innerWidth < 1120) setSourcesOpen(false);
              }}
              aria-pressed={effectsOpen}
            >
              <StudioIcon name="spark" /> Cài đặt
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <StudioIcon name="screen" /> {sourcesLabel}
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
        {sourcesConnected ? connectedLabel : idleLabel}
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
