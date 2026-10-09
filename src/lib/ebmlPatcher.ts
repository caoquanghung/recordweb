import fixWebmDuration from 'fix-webm-duration';

/**
 * Patches the WebM binary container EBML headers with the exact duration in milliseconds,
 * ensuring seeking works in all video players.
 */
export async function repairWebmDuration(rawBlob: Blob, durationMs: number): Promise<Blob> {
  return new Promise((resolve) => {
    try {
      fixWebmDuration(rawBlob, durationMs, (fixedBlob: Blob) => {
        resolve(fixedBlob);
      });
    } catch (err) {
      console.warn('Could not fix WebM duration; falling back to raw blob:', err);
      resolve(rawBlob);
    }
  });
}
