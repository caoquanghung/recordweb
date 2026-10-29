'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './StudioLeaveWarning.module.css';

// Feature-detect the Navigation API; older browsers still get link/unload guards.
interface HistoryNavigationEvent extends Event {
  navigationType: string;
  destination: { url: string; key: string; sameDocument: boolean };
}

interface BrowserNavigation extends EventTarget {
  traverseTo: (key: string) => { finished: Promise<unknown> };
}

export function StudioLeaveWarning({ reason, onConfirmLeave }: {
  reason: string | null;
  onConfirmLeave?: () => Promise<void>;
}) {
  const [leaving, setLeaving] = useState(false);
  const onConfirmLeaveRef = useRef(onConfirmLeave);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const pendingLeaveRef = useRef<(() => void) | null>(null);
  const reasonRef = useRef(reason);
  const enabled = Boolean(reason);

  useEffect(() => {
    reasonRef.current = reason;
    onConfirmLeaveRef.current = onConfirmLeave;
  }, [reason, onConfirmLeave]);

  useEffect(() => {
    if (!enabled) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    let allowNavigation = false;
    let approvedHistoryKey: string | null = null;
    let resetAllowance: number | undefined;
    const navigation = (window as Window & { navigation?: BrowserNavigation }).navigation;

    const requestLeave = (proceed: () => void) => {
      pendingLeaveRef.current = () => {
        // A confirmed link must not trigger a second browser unload prompt.
        allowNavigation = true;
        resetAllowance = window.setTimeout(() => { allowNavigation = false; }, 0);
        proceed();
      };
      if (!dialog.open) dialog.showModal();
      stayButtonRef.current?.focus();
    };
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigation || !reasonRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const warnBeforeLink = (event: MouseEvent) => {
      if (allowNavigation || event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download')
        || (link.target && link.target !== '_self')) return;
      const destination = new URL(link.href, window.location.href);
      if (!['http:', 'https:'].includes(destination.protocol)) return;
      const current = new URL(window.location.href);
      if (destination.origin === current.origin && destination.pathname === current.pathname
        && destination.search === current.search) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // Replay the original link so Next.js and existing click handlers still run.
      requestLeave(() => link.click());
    };
    const warnBeforeHistory = (event: Event) => {
      const historyEvent = event as HistoryNavigationEvent;
      if (approvedHistoryKey === historyEvent.destination.key) {
        approvedHistoryKey = null;
        return;
      }
      if (allowNavigation || historyEvent.navigationType !== 'traverse'
        || !historyEvent.cancelable || !historyEvent.destination.sameDocument) return;
      const destination = new URL(historyEvent.destination.url);
      const current = new URL(window.location.href);
      if (destination.pathname === current.pathname && destination.search === current.search) return;
      event.preventDefault();
      requestLeave(() => {
        approvedHistoryKey = historyEvent.destination.key;
        // A further user navigation may abort this traversal; it is safe to ignore.
        void navigation?.traverseTo(historyEvent.destination.key).finished.catch(() => undefined).finally(() => {
          approvedHistoryKey = null;
        });
      });
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', warnBeforeLink, true);
    navigation?.addEventListener('navigate', warnBeforeHistory);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', warnBeforeLink, true);
      navigation?.removeEventListener('navigate', warnBeforeHistory);
      window.clearTimeout(resetAllowance);
      pendingLeaveRef.current = null;
      dialog.close();
    };
  }, [enabled]);

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="recording-leave-title"
      aria-describedby="recording-leave-reason" onCancel={(event) => {
        if (leaving) event.preventDefault();
        else pendingLeaveRef.current = null;
      }}>
      <h2 id="recording-leave-title">Leave before saving is complete?</h2>
      <p id="recording-leave-reason">{reason}</p>
      <div className={styles.actions}>
        <button ref={stayButtonRef} className={styles.stay} type="button" disabled={leaving} onClick={() => {
          pendingLeaveRef.current = null;
          dialogRef.current?.close();
        }}>
          Stay on this page
        </button>
        <button className={styles.leave} type="button" disabled={leaving} onClick={async () => {
          const proceed = pendingLeaveRef.current;
          pendingLeaveRef.current = null;
          setLeaving(true);
          try {
            await onConfirmLeaveRef.current?.();
          } finally {
            dialogRef.current?.close();
            proceed?.();
            setLeaving(false);
          }
        }}>{leaving ? 'Leaving…' : 'Leave anyway'}</button>
      </div>
    </dialog>
  );
}
