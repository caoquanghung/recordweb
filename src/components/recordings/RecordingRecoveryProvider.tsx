'use client';

import { useAuth } from '@clerk/nextjs';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getRecordingDraftSummaries, type RecordingDraftSummary } from '@/lib/idb';
import { RECORDING_RECOVERY_CHANGED } from '@/lib/recordingRecoveryEvents';

interface RecoveryState {
  ownerUserId: string | null;
  drafts: RecordingDraftSummary[];
  error: string;
}

interface RecoveryContextValue {
  drafts: RecordingDraftSummary[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const RecoveryContext = createContext<RecoveryContextValue | null>(null);

export function RecordingRecoveryProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const [state, setState] = useState<RecoveryState>({ ownerUserId: null, drafts: [], error: '' });
  const requestRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const request = ++requestRef.current;
    try {
      const drafts = await getRecordingDraftSummaries(userId);
      if (request === requestRef.current) setState({ ownerUserId: userId, drafts, error: '' });
    } catch (cause) {
      if (request === requestRef.current) setState((current) => ({
        ownerUserId: userId, drafts: current.ownerUserId === userId ? current.drafts : [],
        error: `Không thể đọc bản sao lưu: ${(cause as Error).message}`,
      }));
    }
  }, [userId]);

  useEffect(() => {
    const requests = requestRef;
    const initial = window.setTimeout(() => void refresh(), 0);
    const onChange = () => { void refresh(); };
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === RECORDING_RECOVERY_CHANGED) void refresh(); };
    window.addEventListener(RECORDING_RECOVERY_CHANGED, onChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      ++requests.current;
      window.clearTimeout(initial);
      window.removeEventListener(RECORDING_RECOVERY_CHANGED, onChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  const value = useMemo<RecoveryContextValue>(() => ({
    drafts: state.ownerUserId === userId ? state.drafts : [],
    loading: !isLoaded || Boolean(userId && state.ownerUserId !== userId),
    error: state.ownerUserId === userId ? state.error : '',
    refresh,
  }), [state, userId, isLoaded, refresh]);
  return <RecoveryContext.Provider value={value}>{children}</RecoveryContext.Provider>;
}

export function useRecordingRecovery() {
  const value = useContext(RecoveryContext);
  if (!value) throw new Error('useRecordingRecovery requires RecordingRecoveryProvider.');
  return value;
}
