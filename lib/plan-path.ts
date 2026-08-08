/**
 * Shortest capture chain on the road graph.
 *
 * Undirected edges. Starts from every node owned by the planning kingdom;
 * multi-source BFS → fewest hops to the target.
 */

import type { NodeKind } from "@/db/schema";
import { hasShield } from "./staleness";

export type PlanPathNodeLike = {
  id: number;
  owner: number | null;
  level: number;
  kind: NodeKind;
  shieldUntil: number | null;
};

export type PlanPathEdgeLike = {
  aId: number;
  bId: number;
};

export type ShortestPathOptions = {
  /** Node ids that must not be used (e.g. just removed from the plan). */
  avoid?: ReadonlySet<number>;
  /** Unix seconds the shield clock is read against. Defaults to "now". */
  now?: number;
  /**
   * Route as if no gate were shielded. Only for working out *why* a target
   * came back unreachable — never for a trail that gets saved.
   */
  ignoreGateShields?: boolean;
};

/**
 * A gate nobody can walk through right now.
 *
 * A shield cannot be taken down, so a shielded gate is not a slow hop, it is a
 * wall: everything behind it is out of reach until the timer runs out, and a
 * trail drawn straight through one is a plan for a move the game will refuse.
 *
 * Ours does not count. The shield on a gate we already hold is protecting our
 * own back, not standing in our way — pushing outward from behind it is the
 * normal thing to do.
 */
export function isSealedGate(
  node: PlanPathNodeLike,
  planningKingdomId: number,
  now: number,
): boolean {
  if (node.kind !== "gate") return false;
  if (node.owner === planningKingdomId) return false;
  return hasShield(node.shieldUntil, now);
}

function buildAdj(
  edges: PlanPathEdgeLike[],
  avoid?: ReadonlySet<number>,
): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    if (avoid?.has(a) || avoid?.has(b)) return;
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (const e of edges) {
    add(e.aId, e.bId);
    add(e.bId, e.aId);
  }
  return adj;
}

/**
 * Node id sequence start…target inclusive, or null if unreachable / nonsense.
 * Start is always owned by the planning kingdom.
 */
export function shortestCapturePath(
  targetId: number,
  planningKingdomId: number,
  nodeList: PlanPathNodeLike[],
  edgeList: PlanPathEdgeLike[],
  options?: ShortestPathOptions,
): number[] | null {
  const avoid = options?.avoid;
  if (avoid?.has(targetId)) return null;

  const byId = new Map(nodeList.map((n) => [n.id, n]));
  const target = byId.get(targetId);
  if (!target) return null;
  // Already ours — nothing to capture.
  if (target.owner === planningKingdomId) return null;

  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const sealed = (id: number): boolean => {
    if (options?.ignoreGateShields) return false;
    const n = byId.get(id);
    return n ? isSealedGate(n, planningKingdomId, now) : false;
  };

  const sources = nodeList
    .filter((n) => n.owner === planningKingdomId && !avoid?.has(n.id))
    .map((n) => n.id);
  if (sources.length === 0) return null;

  const adj = buildAdj(edgeList, avoid);

  /** parent.get(id) === null means `id` is a BFS root (owned start). */
  const parent = new Map<number, number | null>();
  const queue: number[] = [];
  for (const s of sources) {
    parent.set(s, null);
    queue.push(s);
  }

  let reached = false;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi]!;
    if (cur === targetId) {
      reached = true;
      break;
    }
    // A sealed gate is still a legal *destination* — "this gate is what is in
    // our way, put it on the plan" is exactly what an officer wants to record.
    // What it is not is a hop: the search stops here and looks for a way round.
    if (sealed(cur)) continue;
    for (const next of adj.get(cur) ?? []) {
      if (avoid?.has(next)) continue;
      if (parent.has(next)) continue;
      parent.set(next, cur);
      queue.push(next);
    }
  }
  if (!reached) return null;

  const rev: number[] = [];
  let walk: number | null = targetId;
  while (walk !== null) {
    rev.push(walk);
    if (!parent.has(walk)) return null;
    const p: number | null = parent.get(walk) as number | null;
    if (p === null) break;
    walk = p;
  }
  rev.reverse();
  return rev;
}

/**
 * The gate that made a target unreachable, if that is what happened.
 *
 * Called only after the real search came back empty: if every route is blocked
 * then the shortest route ignoring shields must cross at least one sealed
 * gate, so it is enough to walk that one and name the first. "Заперты врата
 * Ashen Gate" tells an officer to check a timer; "нет дороги" sends them
 * looking for a road that is right there.
 */
export function blockingSealedGate(
  targetId: number,
  planningKingdomId: number,
  nodeList: PlanPathNodeLike[],
  edgeList: PlanPathEdgeLike[],
  options?: Omit<ShortestPathOptions, "ignoreGateShields">,
): PlanPathNodeLike | null {
  const open = shortestCapturePath(
    targetId,
    planningKingdomId,
    nodeList,
    edgeList,
    { ...options, ignoreGateShields: true },
  );
  if (!open) return null;

  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const byId = new Map(nodeList.map((n) => [n.id, n]));
  for (const id of open) {
    // The target itself being a sealed gate is not a blockage — you are
    // allowed to plan it. Only gates *on the way* stop the route.
    if (id === targetId) continue;
    const n = byId.get(id);
    if (n && isSealedGate(n, planningKingdomId, now)) return n;
  }
  return null;
}
