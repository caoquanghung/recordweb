'use client';

import { useAuth } from '@clerk/nextjs';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { createCloudLibraryCache, EMPTY_CLOUD_LIBRARY } from '@/lib/cloudLibraryCache';
import { CLOUD_LIBRARY_CHANGED, CLOUD_RECORDING_SAVED, notifyCloudLibraryChanged } from '@/lib/cloudLibraryEvents';
import type { DbRecording, DbStudioPreset } from '@/types/database';

const CloudContext = createContext<ReturnType<typeof createCloudLibraryCache> | null | undefined>(undefined);
const emptySnapshot = () => EMPTY_CLOUD_LIBRARY;
const subscribeEmpty = () => () => {};

export function CloudLibraryProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const cache = useMemo(() => isLoaded && userId ? createCloudLibraryCache(userId) : null, [userId, isLoaded]);
  useEffect(() => {
    if (!cache || !userId) return;
    const onSaved = (event: Event) => {
      const { ownerUserId, recording } = (event as CustomEvent<{ ownerUserId: string; recording: DbRecording }>).detail;
      if (ownerUserId === userId) cache.upsertRecording(recording);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CLOUD_LIBRARY_CHANGED || !event.newValue) return;
      try {
        const { ownerUserId, kind } = JSON.parse(event.newValue);
        if (ownerUserId === userId && (kind === 'recordings' || kind === 'presets')) {
          void cache.refreshLoaded(kind).catch(() => undefined);
        }
      } catch { /* Ignore unrelated/invalid browser storage values. */ }
    };
    window.addEventListener(CLOUD_RECORDING_SAVED, onSaved);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CLOUD_RECORDING_SAVED, onSaved);
      window.removeEventListener('storage', onStorage);
    };
  }, [cache, userId]);
  return <CloudContext.Provider value={cache}>{children}</CloudContext.Provider>;
}

export function useCloudLibrary() {
  const cache = useContext(CloudContext);
  if (cache === undefined) throw new Error('useCloudLibrary requires CloudLibraryProvider.');
  const { userId, isLoaded } = useAuth();
  const snapshot = useSyncExternalStore(cache?.subscribe ?? subscribeEmpty, cache?.getSnapshot ?? emptySnapshot, emptySnapshot);
  return { cache, snapshot, userId, isLoaded };
}

export function useCloudRecordings() {
  const { cache, snapshot, userId, isLoaded } = useCloudLibrary();
  useEffect(() => { void cache?.loadRecordings().catch(() => undefined); }, [cache]);
  return {
    recordings: snapshot.recordings.data ?? [],
    loading: !isLoaded || Boolean(userId && snapshot.recordings.data === null && !snapshot.recordings.error),
    ownerUserId: userId,
    refreshing: snapshot.recordings.refreshing,
    error: snapshot.recordings.error,
    refresh: () => cache?.loadRecordings(true) ?? Promise.resolve(),
    remove: (id: string) => {
      cache?.removeRecording(id);
      if (userId) notifyCloudLibraryChanged(userId, 'recordings');
    },
  };
}

export function useCloudPresets() {
  const { cache, snapshot, userId, isLoaded } = useCloudLibrary();
  useEffect(() => { void cache?.loadPresets().catch(() => undefined); }, [cache]);
  return {
    presets: snapshot.presets.data ?? [],
    loading: !isLoaded || Boolean(userId && snapshot.presets.data === null && !snapshot.presets.error),
    error: snapshot.presets.error,
    upsert: (preset: DbStudioPreset) => {
      cache?.upsertPreset(preset);
      if (userId) notifyCloudLibraryChanged(userId, 'presets');
    },
  };
}
