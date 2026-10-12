/**
 * Keeps the screen awake while an export runs: a screen wake lock, requested
 * again whenever the page becomes visible (browsers release it on hide).
 * Returns the release function. Without the Wake Lock API it does nothing.
 */
export function holdWakeLock(): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let active = true;

  const request = async (): Promise<void> => {
    if (!active || sentinel !== null || document.visibilityState !== 'visible') {
      return;
    }
    if (!('wakeLock' in navigator)) {
      return;
    }
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!active) {
        await lock.release();
        return;
      }
      sentinel = lock;
      lock.addEventListener('release', () => {
        if (sentinel === lock) {
          sentinel = null;
        }
      });
    } catch {
      // Denied (for example by a permissions policy or battery saver): export anyway.
    }
  };

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      void request();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  void request();

  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisibility);
    const lock = sentinel;
    sentinel = null;
    lock?.release().catch(() => undefined);
  };
}
