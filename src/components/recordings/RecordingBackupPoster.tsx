'use client';

import Image from 'next/image';
import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';
import { loadRecordingBackupThumbnail } from '@/lib/recordingThumbnailClient';
import styles from './RecordingBackupPoster.module.css';

export function RecordingBackupPoster({ recordingId }: { recordingId: string }) {
  const { userId } = useAuth();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ key: string; image: string | null } | null>(null);
  const key = `${userId}:${recordingId}`;

  useEffect(() => {
    if (!userId || !containerRef.current) return;
    const controller = new AbortController();
    const load = () => {
      void loadRecordingBackupThumbnail(recordingId, userId, controller.signal).then((image) => {
        if (!controller.signal.aborted) setResult({ key, image });
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ key, image: null });
      });
    };
    let observer: IntersectionObserver | undefined;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          load();
        }
      }, { rootMargin: '160px' });
      observer.observe(containerRef.current);
    } else {
      load();
    }
    return () => {
      observer?.disconnect();
      controller.abort();
    };
  }, [recordingId, userId, key]);

  const image = result?.key === key ? result.image : null;
  return (
    <span ref={containerRef} className={styles.poster} aria-hidden="true">
      {image && <Image src={image} alt="" fill unoptimized sizes="(max-width: 720px) 100vw, 33vw" className={styles.image} />}
    </span>
  );
}
