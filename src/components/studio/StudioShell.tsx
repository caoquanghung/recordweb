'use client';

import { AppSidebar } from '@/components/app/AppSidebar';
import { StudioHeader, StudioSessionNotice, StudioToolbar } from './StudioChrome';
import { StudioDiagnosticsDrawer } from './StudioDiagnosticsDrawer';
import { StudioEffectsPanel } from './StudioEffectsPanel';
import { StudioReviewWorkspace } from './StudioReviewWorkspace';
import { StudioSourcesPanel } from './StudioSourcesPanel';
import { StudioStage } from './StudioStage';
import { useStudioController } from './useStudioController';
import styles from './StudioShell.module.css';

export function StudioShell() {
  const studio = useStudioController();

  return (
    <main className={`${styles.appShell} ${styles.studioScreen}`}>
      <div className={styles.studioNavigation}>
        <button
          className={styles.studioNavigationEdge}
          type="button"
          aria-label="Mở điều hướng chính"
          title="Di chuột vào đây để mở điều hướng"
        >
          <span aria-hidden="true" />
        </button>
        <AppSidebar behavior="adaptive" activeHref="/studio" className={styles.studioSidebar} />
      </div>

      <section className={styles.workspace}>
        <StudioHeader studio={studio} />
        <StudioToolbar studio={studio} />
        <StudioSessionNotice studio={studio} />

        {studio.session === 'review' ? (
          <StudioReviewWorkspace studio={studio} />
        ) : (
          <div className={`${styles.studioGrid} ${!studio.sourcesOpen ? styles.sourcesClosed : ''} ${!studio.effectsOpen ? styles.effectsClosed : ''}`}>
            {studio.sourcesOpen && <StudioSourcesPanel studio={studio} />}
            <StudioStage studio={studio} />
            {studio.effectsOpen && <StudioEffectsPanel studio={studio} />}
          </div>
        )}

        <StudioDiagnosticsDrawer studio={studio} />
        <div className={styles.srOnly} aria-live="polite">Session status: {studio.sessionLabel}</div>
      </section>
    </main>
  );
}
