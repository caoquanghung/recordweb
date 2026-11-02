import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/app/AppSidebar';
import styles from './LibraryClient.module.css';

export function LibraryLayout({
  activeHref, eyebrow, countLabel, title, description, summary, children, overlay,
}: {
  activeHref: string;
  eyebrow: string;
  countLabel: string;
  title: string;
  description: string;
  summary: ReactNode;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <div className={styles.libraryShell}>
      <AppSidebar activeHref={activeHref} />
      <main className={styles.libraryMain}>
        <div className={styles.libraryContent}>
          <header className={styles.summaryPanel}>
            <div className={styles.summaryCopy}>
              <div className={styles.summaryMeta}>
                <span className={styles.liveDot} aria-hidden="true" />
                <span className={styles.eyebrow}>{eyebrow}</span>
                <span className={styles.countBadge}>{countLabel}</span>
              </div>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            {summary}
          </header>
          {children}
        </div>
        {overlay}
      </main>
    </div>
  );
}
