/** Formats seconds as `m:ss.t` (tenths), for example 7.207 -> `0:07.2`. */
export function formatClock(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10));
  const minutes = Math.floor(tenths / 600);
  const rest = tenths - minutes * 600;
  const whole = Math.floor(rest / 10);
  return `${minutes}:${String(whole).padStart(2, '0')}.${rest % 10}`;
}

/** Formats a remaining duration as `m:ss`, rounding up, for example 8.2 -> `0:09`. */
export function formatEta(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total - minutes * 60).padStart(2, '0')}`;
}

/** Formats a byte count as `12.3 MB` (decimal units). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) {
    return `${(bytes / 1e9).toFixed(2)} GB`;
  }
  if (bytes >= 1e6) {
    return `${(bytes / 1e6).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
