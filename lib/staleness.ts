/**
 * Freshness of hand-collected map data.
 *
 * Everything here works in unix **seconds** and takes `now` explicitly, so the
 * server and the client can agree even when a phone's clock drifts (the map
 * screen passes a clock corrected by the server's own timestamp).
 */

/** A node nobody has confirmed for this long is flagged for a re-check. */
export const STALE_AFTER_HOURS = 12;

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function hoursSince(checkedAt: number | null, now: number): number | null {
  if (!checkedAt) return null;
  return (now - checkedAt) / 3600;
}

/** Never-checked nodes count as stale — they are exactly what needs a look. */
export function isStale(checkedAt: number | null, now: number): boolean {
  if (!checkedAt) return true;
  return now - checkedAt >= STALE_AFTER_HOURS * 3600;
}

export function shieldSecondsLeft(
  shieldUntil: number | null,
  now: number,
): number {
  if (!shieldUntil) return 0;
  return Math.max(0, shieldUntil - now);
}

export function hasShield(shieldUntil: number | null, now: number): boolean {
  return shieldSecondsLeft(shieldUntil, now) > 0;
}

/**
 * Whether a node is actually worth walking over to look at.
 *
 * A shielded node cannot change hands, so "nobody has confirmed this lately"
 * is not news about it — and the flag would land on every node somebody just
 * took, which is exactly the set nobody needs to re-check. The countdown
 * beside it already says everything there is to say. The moment the shield
 * runs out the node is stale again on its own: both facts are stored, so
 * nothing has to be recomputed or migrated when it flips back.
 */
export function needsCheck(
  checkedAt: number | null,
  shieldUntil: number | null,
  now: number,
): boolean {
  return isStale(checkedAt, now) && !hasShield(shieldUntil, now);
}

/** `07:41:06`, and `2д 07:41:06` once it runs past a day. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * The same countdown for the map: `2d 07h`, `7h 56m`, `56m`.
 *
 * The map shows these on every shielded node at once, so precision costs
 * width it does not have — and ticking seconds would redraw the label every
 * frame of the clock for a number nobody reads at a glance. The exact
 * `hh:mm:ss` stays in the side panel, where one node has the whole width.
 */
export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}h`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

/** Compact "how long ago", for the last-checked line. */
export function formatAgo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
