/**
 * Shortest capture chain on the road graph.
 *
 * Undirected edges. Starts from every node owned by the planning kingdom;
 * multi-source BFS → fewest hops to the target.
 */

export type PlanPathNodeLike = {
  id: number;
  owner: number | null;
  level: number;
};

export type PlanPathEdgeLike = {
  aId: number;
  bId: number;
};

export type ShortestPathOptions = {
  /** Node ids that must not be used (e.g. just removed from the plan). */
  avoid?: ReadonlySet<number>;
};

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
