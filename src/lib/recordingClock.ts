export interface RecordingClock {
  elapsed: () => number;
  isActive: () => boolean;
  pause: () => number;
  reset: () => void;
  start: () => void;
}

export function createRecordingClock(
  now: () => number = () => performance.now(),
): RecordingClock {
  let activeStartedAt: number | null = null;
  let accumulatedMs = 0;

  const elapsed = () => (
    accumulatedMs + (activeStartedAt === null ? 0 : now() - activeStartedAt)
  );

  return Object.freeze({
    elapsed,
    isActive: () => activeStartedAt !== null,
    pause: () => {
      if (activeStartedAt !== null) accumulatedMs += now() - activeStartedAt;
      activeStartedAt = null;
      return accumulatedMs;
    },
    reset: () => {
      activeStartedAt = null;
      accumulatedMs = 0;
    },
    start: () => {
      if (activeStartedAt === null) activeStartedAt = now();
    },
  });
}
