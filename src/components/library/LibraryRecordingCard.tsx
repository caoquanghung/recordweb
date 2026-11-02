import type { ComponentProps, ReactNode } from 'react';
import { RecordingThumbnail } from './LibraryPrimitives';
import styles from './LibraryClient.module.css';

interface LibraryCardGridProps {
  children: ReactNode;
  label?: string;
  className?: string;
}

export function LibraryCardGrid({
  children,
  label = 'Danh sách bài giảng',
  className,
}: LibraryCardGridProps) {
  const gridClassName = className 
    ? `${styles.recordingGrid} ${className}` 
    : styles.recordingGrid;

  return (
    <section className={gridClassName} aria-label={label}>
      {children}
    </section>
  );
}

interface LibraryRecordingCardProps {
  title: string;
  description?: string;
  thumbnail: Omit<ComponentProps<typeof RecordingThumbnail>, 'title'>;
  metadata?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function LibraryRecordingCard({
  title,
  description,
  thumbnail,
  metadata,
  actions,
  className,
}: LibraryRecordingCardProps) {
  const cardClassName = className 
    ? `${styles.card} ${className}` 
    : styles.card;

  return (
    <article className={cardClassName}>
      <RecordingThumbnail {...thumbnail} title={title} />
      <div className={styles.cardBody}>
        <div className={styles.cardCopy}>
          <h3 className={styles.cardTitle}>{title}</h3>
          {description && <p className={styles.cardDescription}>{description}</p>}
        </div>
        {metadata && <div className={styles.cardMeta}>{metadata}</div>}
        {actions && <div className={styles.cardActions}>{actions}</div>}
      </div>
    </article>
  );
}