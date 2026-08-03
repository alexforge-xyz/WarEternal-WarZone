const store = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Returns true if the key is within the allowed limit, false if rate-limited. */
export function checkRateLimit(key: string, maxPerHour: number): boolean {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= maxPerHour) return false;
  hits.push(now);
  store.set(key, hits);
  return true;
}
