/**
 * Shared live-channel event shapes (client + server).
 *
 * Transport is SSE (`/api/live`). Writers are server actions; readers are
 * open map/chat tabs. Keep payloads small — heavy data goes through REST
 * (`/api/map`) keyed by `map.version`.
 *
 * Reserved for later (same bus, no second transport):
 *   chat.message | chat.typing | sim.plan
 */

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
      type: "ping";
      t: number;
    };

export type MapSnapshot = {
  boot: number;
  version: number;
  serverNow: number;
  nodes: import("@/db/schema").NodeRow[];
  edges: import("@/db/schema").EdgeRow[];
};
