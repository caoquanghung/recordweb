'use client';

import { useState } from 'react';
import { AppSidebar } from '@/components/app/AppSidebar';
import { PresentationSourcesPanel } from './PresentationSourcesPanel';
import { PresentationStage } from './PresentationStage';
import { StudioHeader, StudioSessionNotice, StudioToolbar } from './StudioChrome';
import { StudioDiagnosticsDrawer } from './StudioDiagnosticsDrawer';
import { StudioEffectsPanel } from './StudioEffectsPanel';
import { StudioReviewWorkspace } from './StudioReviewWorkspace';
import { StudioSourcesPanel } from './StudioSourcesPanel';
import { StudioStage } from './StudioStage';
import { useStudioController } from './useStudioController';
import styles from './StudioShell.module.css';

type StudioScreenWorkspace = 'recording' | 'presentation';

function RecordingWorkspace({ onOpenPresentation }: { onOpenPresentation: () => void }) {
  const studio = useStudioController();

  return (
    <section className={`${styles.workspace} ${studio.session === 'review' ? '' : styles.standardWorkspace}`}>
      <StudioHeader studio={studio} />
      <StudioToolbar studio={studio} onOpenPresentation={onOpenPresentation} />
      <StudioSessionNotice studio={studio} />

      {studio.session === 'review' ? (
        <StudioReviewWorkspace studio={studio} />
      ) : (
        <div className={`${styles.studioGrid} ${styles.standardGrid} ${!studio.sourcesOpen ? styles.sourcesClosed : ''} ${!studio.effectsOpen ? styles.effectsClosed : ''}`}>
          {studio.sourcesOpen && <StudioSourcesPanel studio={studio} />}
          <StudioStage studio={studio} />
          {studio.effectsOpen && <StudioEffectsPanel studio={studio} />}
        </div>
      )}

      <StudioDiagnosticsDrawer studio={studio} />
      <div className={styles.srOnly} aria-live="polite">
        Session status: {studio.session === 'setup'
          ? (studio.recordingReady ? 'Ready' : 'Setup needed')
          : studio.sessionLabel}
      </div>
    </section>
  );
}

function PresentationWorkspace({ onReturnToRecording }: { onReturnToRecording: () => void }) {
  const studio = useStudioController({ workspace: 'presentation' });

  return (
    <section className={styles.workspace}>
      <StudioHeader
        studio={studio}
        integratedPresentation
        onReturnToRecording={onReturnToRecording}
      />
      <StudioToolbar studio={studio} integratedPresentation />
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
  );
}

export function StudioShell({ initialWorkspace = 'recording' }: { initialWorkspace?: StudioScreenWorkspace }) {
  const [workspace, setWorkspace] = useState<StudioScreenWorkspace>(initialWorkspace);

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

      {workspace === 'presentation' ? (
        <PresentationWorkspace onReturnToRecording={() => setWorkspace('recording')} />
      ) : (
        <RecordingWorkspace onOpenPresentation={() => setWorkspace('presentation')} />
      )}
    </main>
  );
}
