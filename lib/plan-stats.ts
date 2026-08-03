/**
 * Cost / gain of the shared capture plan — always over the **union** of nodes
 * still to take. A node on two trails is one node, one horn bill, one yield.
 */

import { effectiveYield } from "./crystals";
import { hornsAreProvisional, hornsForNode } from "./horns";

export type PlanStatsNode = {
  id: number;
  owner: number | null;
  kind: import("@/db/schema").NodeKind;
  level: number;
  buffAtk: number;
  buffDef: number;
  buffHp: number;
  amethystOverride: number | null;
  sapphireOverride: number | null;
};

export type PlanStats = {
  /** Nodes still not owned by the planning kingdom. */
  captureCount: number;
  /** Sum of horns on capture nodes; null only if every level is invalid. */
  horns: number | null;
  /** True when at least one capture node is level 3+ (estimate). */
  hornsProvisional: boolean;
  amethystPerHour: number | null;
  sapphirePerHour: number | null;
  buffAtk: number;
  buffDef: number;
  buffHp: number;
};

export function computePlanStats(
  nodeIds: Iterable<number>,
  byId: Map<number, PlanStatsNode>,
  planningKingdomId: number,
): PlanStats {
  let captureCount = 0;
  let horns = 0;
  let hornsUnknown = false;
  let hornsProvisional = false;
  let amethyst = 0;
  let sapphire = 0;
  let amethystUnknown = false;
  let sapphireUnknown = false;
  let buffAtk = 0;
  let buffDef = 0;
  let buffHp = 0;

  for (const id of nodeIds) {
    const n = byId.get(id);
    if (!n) continue;
    if (n.owner === planningKingdomId) continue;

    captureCount += 1;
    const h = hornsForNode(n);
    if (h === null) hornsUnknown = true;
    else {
      horns += h;
      if (hornsAreProvisional(n)) hornsProvisional = true;
    }

    const y = effectiveYield(n);
    if (y.amethyst === null) amethystUnknown = true;
    else amethyst += y.amethyst;
    if (y.sapphire === null) sapphireUnknown = true;
    else sapphire += y.sapphire;

    buffAtk += n.buffAtk;
    buffDef += n.buffDef;
    buffHp += n.buffHp;
  }

  return {
    captureCount,
    // If some nodes had bad levels, still show the sum of the rest (0 if none).
    horns: captureCount === 0 ? 0 : hornsUnknown && horns === 0 ? null : horns,
    hornsProvisional,
    amethystPerHour: amethystUnknown ? null : amethyst,
    sapphirePerHour: sapphireUnknown ? null : sapphire,
    buffAtk,
    buffDef,
    buffHp,
  };
}

/** Directed edges for the light-wave layer, with hop from each trail start. */
export function planEdgesFromPaths(
  paths: { nodes: number[] }[],
): { aId: number; bId: number; hop: number }[] {
  const seen = new Set<string>();
  const out: { aId: number; bId: number; hop: number }[] = [];
  for (const path of paths) {
    for (let i = 0; i < path.nodes.length - 1; i++) {
      const aId = path.nodes[i]!;
      const bId = path.nodes[i + 1]!;
      const key = `${aId}>${bId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ aId, bId, hop: i });
    }
  }
  return out;
}
