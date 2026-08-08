/**
 * Capture-plan shapes shared by server actions, `/api/plan`, and the war room.
 * Kept out of `db/queries` so the client can import types without `server-only`.
 */

export type PlanPathView = {
  id: number;
  label: string | null;
  sort: number;
  /** Ordered node ids: [owned start, …, tip]. */
  nodes: number[];
};

export type PlanNoteView = {
  id: number;
  nodeId: number;
  body: string;
  nick: string;
  at: number;
};

export type PlanSnapshot = {
  planningKingdomId: number | null;
  /**
   * Auto-routing walks through shielded enemy gates as if they were open.
   * Shared setting — see `plan_settings.bypass_shields`.
   */
  bypassShields: boolean;
  paths: PlanPathView[];
  /** Shared sticky notes on nodes (clouds on the map). */
  notes: PlanNoteView[];
};
