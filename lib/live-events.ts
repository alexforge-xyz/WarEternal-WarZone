/**
 * Shared live-channel event shapes (client + server).
 *
 * Transport is SSE (`/api/live`). Writers are server actions; readers are
 * open map/chat tabs. Keep payloads small — heavy data goes through REST
 * (`/api/map`) keyed by `map.version`.
 *
 */

/**
 * One line of the officer chat, as it travels to the browser. Deliberately the
 * whole message and not a "something changed" nudge like `map.version`: a chat
 * line is ~100 bytes, and making every open room refetch on each keystroke of
 * planning would be the one place where the version trick costs more than it
 * saves.
 */
export type ChatMessage = {
  id: number;
  nick: string;
  body: string;
  /** Node this line is pinned to, if any. */
  nodeId: number | null;
  at: number;
};

export type LiveEvent =
  | {
      type: "hello";
      /** Process boot id — changes on deploy/restart so clients resync. */
      boot: number;
      version: number;
      t: number;
    }
  | {
      type: "map.version";
      boot: number;
      version: number;
      t: number;
    }
  | {
      /**
       * Officer-only. `/api/live` drops this for anyone below `officer`, so the
       * public map stream carries map versions and nothing else.
       */
      type: "chat.message";
      boot: number;
      message: ChatMessage;
      t: number;
    }
  | {
      /**
       * Ephemeral "is typing" pulse. Not stored — clients drop a nick after a
       * few quiet seconds, and a sent line clears that author immediately.
       * Officer-only (same filter as `chat.message`).
       */
      type: "chat.typing";
      boot: number;
      userId: number;
      nick: string;
      /** false = stopped (sent, cleared the box, left). */
      active: boolean;
      t: number;
    }
  | {
      /**
       * Officer-only. Shared capture plan changed — clients re-fetch `/api/plan`
       * (or use the snapshot embedded by the mutator). Light payload only.
       */
      type: "plan.changed";
      boot: number;
      t: number;
    }
  | {
      type: "ping";
      t: number;
    };

/** Events that must never reach a guest or a helper. */
export function isOfficerEvent(event: LiveEvent): boolean {
  return event.type.startsWith("chat.") || event.type.startsWith("plan.");
}

export type MapSnapshot = {
  boot: number;
  version: number;
  serverNow: number;
  nodes: import("@/db/schema").NodeRow[];
  edges: import("@/db/schema").EdgeRow[];
};
