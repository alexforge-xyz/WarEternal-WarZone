"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EdgeRow, NodeRow } from "@/db/schema";
import type { LiveEvent, MapSnapshot } from "@/lib/live-events";
import { reconnectLive, subscribeLive } from "./live-connection";

/**
 * Keeps map rows fresh while the tab stays open.
 *
 * - SSE (`/api/live`, shared socket) pushes `map.version` after any write.
 * - Snapshot (`/api/map`) carries the full node/edge set.
 * - Fallback poll every 30s if the stream is quiet or dead.
 * - Pauses extra work when the tab is hidden (SSE may still reconnect).
 *
 * Local UI state (selection, pan/zoom) lives outside this hook — replacing
 * `nodes`/`edges` does not remount the canvas.
 */

/**
 * How long a local edit is allowed to sit on top of the server's answer.
 *
 * The overlay normally comes off the moment a snapshot newer than the write
 * lands — usually well under a second. This is only the backstop for the case
 * where the write failed (denied, offline) and no newer snapshot is ever
 * coming: better to fall back to the truth than to leave an officer looking at
 * a change that never happened.
 */
const OPTIMISTIC_TTL_MS = 15_000;

/** Node fields a tap on the status panel can move. */
export type NodePatch = Partial<
  Pick<NodeRow, "owner" | "checkedAt" | "shieldUntil" | "battleSince">
>;

type Optimistic = {
  patch: NodePatch;
  /** Map version at the time of the tap; a snapshot past it already has it. */
  fromVersion: number;
  at: number;
};

export function useLiveMap(
  initialNodes: NodeRow[],
  initialEdges: EdgeRow[],
): {
  nodes: NodeRow[];
  edges: EdgeRow[];
  /** Force a snapshot pull (e.g. after your own mutation). */
  refresh: () => Promise<void>;
  /**
   * Show a local edit *now*, before the server has answered.
   *
   * One tap is the whole interaction on this screen, so it has to look like
   * one: a write is a DB round-trip plus a snapshot pull, and with nothing on
   * screen in between, officers read the silence as "it didn't register" and
   * tap again. The patch is held over incoming snapshots until one arrives
   * that is newer than the write.
   */
  patchNode: (id: number, patch: NodePatch) => void;
  /** Same, for a write that moves many nodes at once ("all checked"). */
  patchNodes: (ids: readonly number[], patch: NodePatch) => void;
  live: boolean;
} {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [live, setLive] = useState(false);

  const bootRef = useRef<number | null>(null);
  const versionRef = useRef(0);
  const pullingRef = useRef(false);
  /** A pull was asked for while one was in flight — that answer is too old. */
  const pullAgainRef = useRef(false);
  const mountedRef = useRef(true);
  const optimisticRef = useRef(new Map<number, Optimistic>());

  /**
   * Lay any still-live local edits back over server rows.
   *
   * An entry retires as soon as a snapshot from *after* its write arrives:
   * that snapshot already contains the change, and holding the patch any
   * longer would pin a stale value over a fresher one from another officer.
   */
  const withOptimistic = useCallback((rows: NodeRow[], version: number) => {
    const pend = optimisticRef.current;
    if (pend.size === 0) return rows;
    const cutoff = Date.now() - OPTIMISTIC_TTL_MS;
    for (const [id, entry] of pend) {
      if (version > entry.fromVersion || entry.at < cutoff) pend.delete(id);
    }
    if (pend.size === 0) return rows;
    return rows.map((row) => {
      const entry = pend.get(row.id);
      return entry ? { ...row, ...entry.patch } : row;
    });
  }, []);

  const applySnapshot = useCallback(
    (snap: MapSnapshot) => {
      bootRef.current = snap.boot;
      versionRef.current = snap.version;
      setNodes(withOptimistic(snap.nodes, snap.version));
      setEdges(snap.edges);
    },
    [withOptimistic],
  );

  const patchNodes = useCallback((ids: readonly number[], patch: NodePatch) => {
    if (ids.length === 0) return;
    const target = new Set(ids);
    const entry = {
      patch,
      fromVersion: versionRef.current,
      at: Date.now(),
    };
    for (const id of target) optimisticRef.current.set(id, entry);
    // One pass over the rows however many ids moved — a per-id setState would
    // walk all 231 nodes once per node on "all checked".
    setNodes((prev) =>
      prev.map((row) => (target.has(row.id) ? { ...row, ...patch } : row)),
    );
  }, []);

  const patchNode = useCallback(
    (id: number, patch: NodePatch) => patchNodes([id], patch),
    [patchNodes],
  );

  const pull = useCallback(async (): Promise<void> => {
    // A pull already running started *before* this call, so its answer cannot
    // contain what the caller just wrote. Queue one rather than dropping the
    // request: silently skipping it is how a tap ended up looking ignored
    // until the 30s fallback poll came round.
    if (pullingRef.current) {
      pullAgainRef.current = true;
      return;
    }
    pullingRef.current = true;
    try {
      do {
        pullAgainRef.current = false;
        const res = await fetch("/api/map", { cache: "no-store" });
        if (!res.ok) return;
        const snap = (await res.json()) as MapSnapshot;
        if (!mountedRef.current) return;
        // Ignore stale responses that finished after a newer apply.
        if (bootRef.current === snap.boot && snap.version < versionRef.current) {
          continue;
        }
        applySnapshot(snap);
      } while (pullAgainRef.current && mountedRef.current);
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
      setNodes(withOptimistic(initialNodes, 0));
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, withOptimistic]);

  useEffect(() => {
    const FALLBACK_MS = 30_000;

    // The socket itself is shared with the war-room chat (live-connection.ts);
    // this hook only owns the snapshot pulls and the fallback poll.
    const unsub = subscribeLive(onEvent, (v) => {
      if (mountedRef.current) setLive(v);
    });

    const pollId = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void pull();
    }, FALLBACK_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void pull();
        reconnectLive();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(pollId);
      unsub();
      setLive(false);
    };
  }, [onEvent, pull]);

  return { nodes, edges, refresh: pull, patchNode, patchNodes, live };
}
