"use client";

import type { LiveEvent } from "@/lib/live-events";

/**
 * One `EventSource` per tab, shared by every live hook.
 *
 * The war room shows the map and the chat at the same time, and both listen to
 * `/api/live`. Two hooks each opening their own stream would mean two of the
 * six connections a browser allows per origin — and two subscribers on the
 * server for every officer. So the socket lives here, at module scope, and the
 * hooks subscribe to it.
 *
 * Reconnect is ours rather than the browser's: `EventSource` retries badly
 * after a phone sleeps, which is exactly when an officer comes back to the map.
 */

type Handler = (event: LiveEvent) => void;
type StatusHandler = (live: boolean) => void;

const RETRY_MS = 2000;

const handlers = new Set<Handler>();
const statusHandlers = new Set<StatusHandler>();

let source: EventSource | null = null;
let retryId: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;
let live = false;

function setLive(v: boolean) {
  if (live === v) return;
  live = v;
  for (const h of statusHandlers) h(v);
}

function connect() {
  if (typeof window === "undefined" || handlers.size === 0) return;
  source?.close();
  source = new EventSource("/api/live");

  source.onopen = () => setLive(true);

  source.onmessage = (msg) => {
    let event: LiveEvent;
    try {
      event = JSON.parse(msg.data) as LiveEvent;
    } catch {
      return; // malformed frame; the next one is not worse for it
    }
    // Copy: a handler may unsubscribe while we are iterating.
    for (const h of [...handlers]) h(event);
  };

  source.onerror = () => {
    setLive(false);
    source?.close();
    source = null;
    if (retryId != null) clearTimeout(retryId);
    retryId = setTimeout(connect, RETRY_MS);
  };
}

function disconnect() {
  if (retryId != null) {
    clearTimeout(retryId);
    retryId = null;
  }
  source?.close();
  source = null;
  setLive(false);
}

function onVisibility() {
  if (document.visibilityState !== "visible") return;
  if (handlers.size === 0) return;
  if (!source || source.readyState === EventSource.CLOSED) connect();
}

/**
 * Listen to the shared stream. Returns the unsubscribe; the socket closes when
 * the last subscriber leaves.
 */
export function subscribeLive(
  onEvent: Handler,
  onStatus?: StatusHandler,
): () => void {
  handlers.add(onEvent);
  if (onStatus) {
    statusHandlers.add(onStatus);
    onStatus(live);
  }

  if (!visibilityBound && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
    visibilityBound = true;
  }
  if (!source) connect();

  return () => {
    handlers.delete(onEvent);
    if (onStatus) statusHandlers.delete(onStatus);
    if (handlers.size === 0) disconnect();
  };
}

/** True while the stream is open — surfaced as the "live" dot. */
export function isLive(): boolean {
  return live;
}

/** Re-open now, e.g. when a tab comes back to the foreground. */
export function reconnectLive(): void {
  if (handlers.size === 0) return;
  if (!source || source.readyState === EventSource.CLOSED) connect();
}
