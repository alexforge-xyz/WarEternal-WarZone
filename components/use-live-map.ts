"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EdgeRow, NodeRow } from "@/db/schema";
import type { LiveEvent, MapSnapshot } from "@/lib/live-events";

/**
 * Keeps map rows fresh while the tab stays open.
 *
 * - SSE (`/api/live`) pushes `map.version` after any write on the server.
 * - Snapshot (`/api/map`) carries the full node/edge set.
 * - Fallback poll every 30s if the stream is quiet or dead.
 * - Pauses extra work when the tab is hidden (SSE may still reconnect).
 *
 * Local UI state (selection, pan/zoom) lives outside this hook — replacing
 * `nodes`/`edges` does not remount the canvas.
 */
export function useLiveMap(
  initialNodes: NodeRow[],
  initialEdges: EdgeRow[],
): {
  nodes: NodeRow[];
  edges: EdgeRow[];
  /** Force a snapshot pull (e.g. after your own mutation). */
  refresh: () => Promise<void>;
  live: boolean;
} {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [live, setLive] = useState(false);

  const bootRef = useRef<number | null>(null);
  const versionRef = useRef(0);
  const pullingRef = useRef(false);
  const mountedRef = useRef(true);

  const applySnapshot = useCallback((snap: MapSnapshot) => {
    bootRef.current = snap.boot;
    versionRef.current = snap.version;
    setNodes(snap.nodes);
    setEdges(snap.edges);
  }, []);

  const pull = useCallback(async () => {
    if (pullingRef.current) return;
    pullingRef.current = true;
    try {
      const res = await fetch("/api/map", { cache: "no-store" });
      if (!res.ok) return;
      const snap = (await res.json()) as MapSnapshot;
      if (!mountedRef.current) return;
      // Ignore stale responses that finished after a newer apply.
      if (
        bootRef.current === snap.boot &&
        snap.version < versionRef.current
      ) {
        return;
      }
      applySnapshot(snap);
    } catch {
      /* offline / brief blip — next event or poll retries */
    } finally {
      pullingRef.current = false;
    }
  }, [applySnapshot]);

  const onEvent = useCallback(
    (event: LiveEvent) => {
      if (event.type === "ping") return;

      if (event.type === "hello") {
        const bootChanged =
          bootRef.current !== null && bootRef.current !== event.boot;
        bootRef.current = event.boot;
        if (bootChanged || event.version > versionRef.current) {
          versionRef.current = event.version;
          void pull();
        } else {
          versionRef.current = event.version;
        }
        return;
      }

      if (event.type === "map.version") {
        if (bootRef.current !== null && event.boot !== bootRef.current) {
          bootRef.current = event.boot;
          versionRef.current = 0;
          void pull();
          return;
        }
        if (event.version > versionRef.current) {
          versionRef.current = event.version;
          void pull();
        }
      }
    },
    [pull],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Seed from the server render; if RSC later refreshes props (own action +
  // revalidatePath), merge only when we have no live version yet or arrays
  // clearly replaced by navigation — avoid clobbering a fresher SSE snapshot.
  useEffect(() => {
    if (versionRef.current === 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges]);

  useEffect(() => {
    let es: EventSource | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let retryId: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const FALLBACK_MS = 30_000;

    function startPoll() {
      if (pollId != null) return;
      pollId = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        void pull();
      }, FALLBACK_MS);
    }

    function stopPoll() {
      if (pollId != null) {
        clearInterval(pollId);
        pollId = null;
      }
    }

    function connect() {
      if (closed) return;
      es?.close();
      es = new EventSource("/api/live");

      es.onopen = () => {
        if (!mountedRef.current) return;
        setLive(true);
      };

      es.onmessage = (msg) => {
        try {
          onEvent(JSON.parse(msg.data) as LiveEvent);
        } catch {
          /* ignore malformed */
        }
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        setLive(false);
        es?.close();
        es = null;
        // Browser reconnect is unreliable across sleeps; do our own backoff.
        if (retryId != null) clearTimeout(retryId);
        retryId = setTimeout(connect, 2000);
      };
    }

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void pull();
        if (!es || es.readyState === EventSource.CLOSED) connect();
      }
    };

    connect();
    startPoll();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVis);
      stopPoll();
      if (retryId != null) clearTimeout(retryId);
      es?.close();
      setLive(false);
    };
  }, [onEvent, pull]);

  return { nodes, edges, refresh: pull, live };
}
