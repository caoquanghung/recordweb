'use client';

import Image from 'next/image';
import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';
import { loadRecordingBackupThumbnail, loadCloudRecordingThumbnail } from '@/lib/recordingThumbnailClient';
import styles from './RecordingPoster.module.css';
import { RECORDING_THUMBNAIL_VERSION } from '@/lib/recordingThumbnailPolicy';

export function RecordingPoster({ recordingId, storageUrl }: { recordingId: string; storageUrl?: string | null }) {
  const { userId } = useAuth();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ key: string; image: string | null } | null>(null);
  const key = `${userId}:${recordingId}:${storageUrl ?? 'local'}:${RECORDING_THUMBNAIL_VERSION}`;

  useEffect(() => {
    if (!userId || !containerRef.current) return;
    const controller = new AbortController();
    const load = () => {
      const request = storageUrl
        ? loadCloudRecordingThumbnail(recordingId, userId, storageUrl, controller.signal)
        : loadRecordingBackupThumbnail(recordingId, userId, controller.signal);
      void request.then((image) => {
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
  }, [recordingId, storageUrl, userId, key]);

  const image = result?.key === key ? result.image : null;
  return (
    <span ref={containerRef} className={styles.poster} aria-hidden="true">
      {image && <Image src={image} alt="" fill unoptimized sizes="(max-width: 720px) 100vw, 33vw" className={styles.image} />}
      {!image && result?.key === key && <span className={styles.unavailable}>Chưa tải được ảnh xem trước</span>}
    </span>
  );
}
