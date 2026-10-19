'use client';

import { AppNavigation } from '@/components/app/AppNavigation';
import { StudioHeader, StudioSessionNotice, StudioToolbar } from './StudioChrome';
import { StudioDiagnosticsDrawer } from './StudioDiagnosticsDrawer';
import { StudioEffectsPanel } from './StudioEffectsPanel';
import { PresentationSourcesPanel } from './PresentationSourcesPanel';
import { PresentationStage } from './PresentationStage';
import { StudioReviewWorkspace } from './StudioReviewWorkspace';
import { useStudioController } from './useStudioController';
import styles from './StudioShell.module.css';

export function PresentationShell() {
  const studio = useStudioController({ workspace: 'presentation' });

  return (
    <main className={styles.appShell}>
      <AppNavigation active="presentation" />

      <section className={styles.workspace}>
        <StudioHeader studio={studio} eyebrow="RecordWeb presentation" title="Lecture workspace" />
        <StudioToolbar
          studio={studio}
          sourcesLabel="Lecture sources"
          connectedLabel="Presentation ready"
          idleLabel="Add slides and devices to begin"
        />
        <StudioSessionNotice studio={studio} />

        {studio.session === 'review' ? (
          <StudioReviewWorkspace studio={studio} />
        ) : (
          <div className={`${styles.studioGrid} ${!studio.sourcesOpen ? styles.sourcesClosed : ''} ${!studio.effectsOpen ? styles.effectsClosed : ''}`}>
            {studio.sourcesOpen && <PresentationSourcesPanel studio={studio} />}
            <PresentationStage studio={studio} />
            {studio.effectsOpen && <StudioEffectsPanel studio={studio} />}
          </div>
        )}

        <StudioDiagnosticsDrawer studio={studio} />
        <div className={styles.srOnly} aria-live="polite">Session status: {studio.sessionLabel}</div>
      </section>
    </main>
  );
}
