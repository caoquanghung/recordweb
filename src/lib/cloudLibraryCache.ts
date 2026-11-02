import type { DbRecording, DbStudioPreset } from '@/types/database';

interface Resource<T> {
  data: T[] | null;
  refreshing: boolean;
  error: string;
}

export interface CloudLibrarySnapshot {
  recordings: Resource<DbRecording>;
  presets: Resource<DbStudioPreset>;
}

export const EMPTY_CLOUD_LIBRARY: CloudLibrarySnapshot = {
  recordings: { data: null, refreshing: false, error: '' },
  presets: { data: null, refreshing: false, error: '' },
};

/** One cache per authenticated provider lifetime; never shared between owners. */
export function createCloudLibraryCache(ownerUserId: string) {
  let snapshot = EMPTY_CLOUD_LIBRARY;
  const listeners = new Set<() => void>();
  const pending: Partial<Record<keyof CloudLibrarySnapshot, Promise<void>>> = {};
  const overrides: Record<keyof CloudLibrarySnapshot, Map<string, DbRecording | DbStudioPreset | null>> = {
    recordings: new Map(), presets: new Map(),
  };
  const publish = (next: CloudLibrarySnapshot) => { snapshot = next; listeners.forEach((listener) => listener()); };

  function load<K extends keyof CloudLibrarySnapshot>(kind: K, force = false): Promise<void> {
    const active = pending[kind];
    if (active) return active;
    if (snapshot[kind].data !== null && !force) return Promise.resolve();
    overrides[kind].clear();
    const request = Promise.resolve().then(async () => {
      try {
        const response = await fetch(`/api/${kind}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? `Could not load ${kind}.`);
        const rows = new Map<string, DbRecording | DbStudioPreset>(
          (data[kind] ?? []).filter((row: DbRecording | DbStudioPreset) => row.user_id === ownerUserId)
            .map((row: DbRecording | DbStudioPreset) => [row.id, row]),
        );
        // A GET started before a save/delete must not overwrite the newer mutation.
        overrides[kind].forEach((row, id) => { if (row) rows.set(id, row); else rows.delete(id); });
        publish({ ...snapshot, [kind]: { data: [...rows.values()], refreshing: false, error: '' } });
      } catch (cause) {
        publish({ ...snapshot, [kind]: { ...snapshot[kind], refreshing: false, error: (cause as Error).message } });
        throw cause;
      } finally {
        delete pending[kind];
        overrides[kind].clear();
      }
    });
    pending[kind] = request;
    publish({ ...snapshot, [kind]: { ...snapshot[kind], refreshing: true, error: '' } });
    return request;
  }

  const update = (kind: keyof CloudLibrarySnapshot, id: string, row: DbRecording | DbStudioPreset | null) => {
    if (row && row.user_id !== ownerUserId) return;
    if (pending[kind]) overrides[kind].set(id, row);
    const current = snapshot[kind];
    if (current.data === null) return; // An individual save is not a complete library response.
    const rows = current.data.filter((item) => item.id !== id);
    if (row) rows.unshift(row);
    publish({ ...snapshot, [kind]: { ...current, data: rows } });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    loadRecordings: (force = false) => load('recordings', force),
    loadPresets: (force = false) => load('presets', force),
    upsertRecording: (row: DbRecording) => update('recordings', row.id, row),
    removeRecording: (id: string) => update('recordings', id, null),
    upsertPreset: (row: DbStudioPreset) => update('presets', row.id, row),
    refreshLoaded: (kind: keyof CloudLibrarySnapshot) => {
      const active = pending[kind];
      if (active) return active.catch(() => undefined).then(() => load(kind, true));
      if (snapshot[kind].data !== null) return load(kind, true);
      return Promise.resolve();
    },
  };
}
