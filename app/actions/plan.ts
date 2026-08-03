"use server";

import { and, eq, gte, max } from "drizzle-orm";
import { db } from "@/db";
import { getPlanSnapshot, kingdomExists } from "@/db/queries";
import type { PlanSnapshot } from "@/lib/plan-types";
import {
  edges,
  nodes,
  planNotes,
  planPathNodes,
  planPaths,
  planSettings,
} from "@/db/schema";
import { getRole, getUser } from "@/lib/auth";
import { notifyPlanChanged } from "@/lib/live-server";
import { shortestCapturePath } from "@/lib/plan-path";
import { canEdit, canPlan } from "@/lib/roles";
import { nowSeconds } from "@/lib/staleness";
import type { ActionState } from "./nodes";

const MAX_NOTE = 280;

export type PlanActionState = ActionState & { plan?: PlanSnapshot };

async function requireOfficer(): Promise<
  { ok: true; userId: number } | { ok: false; state: PlanActionState }
> {
  const me = await getUser();
  if (!me || !canPlan(me.role)) {
    return { ok: false, state: { ok: false, error: "auth.denied" } };
  }
  return { ok: true, userId: me.id };
}

async function loadPlanningKingdomId(): Promise<number | null> {
  const [row] = await db
    .select()
    .from(planSettings)
    .where(eq(planSettings.id, 1))
    .limit(1);
  if (row?.planningKingdomId != null) return row.planningKingdomId;
  // Mirror getPlanSettings bootstrap
  const { getPlanSettings } = await import("@/db/queries");
  const s = await getPlanSettings();
  return s.planningKingdomId;
}

/**
 * Toggle a shared trail to `targetNodeId`.
 *
 * - **Tip** of an existing trail → remove that trail (second tap = undo).
 * - **Already on a trail** but not the tip → no-op. Clicking mid-chain used
 *   to spawn a shorter path that then toggled off and looked like the plan
 *   was flickering when officers tapped "different places" along a route.
 * - **New target** → shortest path from nearest owned node of the planning
 *   kingdom. Shared nodes still merge in cost (union).
 */
export async function addPlanPath(
  targetNodeId: number,
): Promise<PlanActionState> {
  const gate = await requireOfficer();
  if (!gate.ok) return gate.state;

  if (!Number.isInteger(targetNodeId)) {
    return { ok: false, error: "plan.badTarget" };
  }

  const planningKingdomId = await loadPlanningKingdomId();
  if (planningKingdomId == null) {
    return { ok: false, error: "plan.noKingdom" };
  }

  const roles = await classifyNodeOnPlan(targetNodeId);

  // Tip → remove those trails only.
  if (roles.tipPathIds.length > 0) {
    for (const id of roles.tipPathIds) {
      await db.delete(planPaths).where(eq(planPaths.id, id));
    }
    try {
      notifyPlanChanged();
    } catch {
      /* bus glitch */
    }
    return { ok: true, plan: await getPlanSnapshot() };
  }

  // Mid-path node → keep selection/pin only; do not invent a stub trail.
  if (roles.onPath) {
    return { ok: true, plan: await getPlanSnapshot() };
  }

  const nodeRows = await db.select().from(nodes);
  const target = nodeRows.find((n) => n.id === targetNodeId);
  if (!target) return { ok: false, error: "plan.badTarget" };
  if (target.owner === planningKingdomId) {
    return { ok: false, error: "plan.alreadyOurs" };
  }

  const edgeRows = await db.select().from(edges);
  const chain = shortestCapturePath(
    targetNodeId,
    planningKingdomId,
    nodeRows,
    edgeRows,
  );
  if (!chain || chain.length < 2) {
    return { ok: false, error: "plan.unreachable" };
  }

  // Exact same chain already listed → no duplicate row.
  const snap = await getPlanSnapshot();
  const chainKey = chain.join(",");
  if (snap.paths.some((p) => p.nodes.join(",") === chainKey)) {
    return { ok: true, plan: snap };
  }

  const [agg] = await db.select({ m: max(planPaths.sort) }).from(planPaths);
  const sort = (agg?.m ?? 0) + 1;

  const [path] = await db
    .insert(planPaths)
    .values({
      sort,
      createdBy: gate.userId,
    })
    .returning();

  await db.insert(planPathNodes).values(
    chain.map((nodeId, step) => ({
      pathId: path.id,
      nodeId,
      step,
    })),
  );

  try {
    notifyPlanChanged();
  } catch {
    /* bus glitch */
  }
  return { ok: true, plan: await getPlanSnapshot() };
}

async function classifyNodeOnPlan(nodeId: number): Promise<{
  /** Paths whose last step is this node. */
  tipPathIds: number[];
  /** Node appears on any trail (start, mid, or tip). */
  onPath: boolean;
}> {
  const steps = await db.select().from(planPathNodes);
  if (steps.length === 0) return { tipPathIds: [], onPath: false };

  const tipByPath = new Map<number, { step: number; nodeId: number }>();
  let onPath = false;
  for (const row of steps) {
    if (row.nodeId === nodeId) onPath = true;
    const cur = tipByPath.get(row.pathId);
    if (!cur || row.step > cur.step) {
      tipByPath.set(row.pathId, { step: row.step, nodeId: row.nodeId });
    }
  }

  const tipPathIds = [...tipByPath.entries()]
    .filter(([, tip]) => tip.nodeId === nodeId)
    .map(([pathId]) => pathId);

  return { tipPathIds, onPath };
}

export async function deletePlanPath(pathId: number): Promise<PlanActionState> {
  const gate = await requireOfficer();
  if (!gate.ok) return gate.state;
  if (!Number.isInteger(pathId)) return { ok: false, error: "plan.badTarget" };

  await db.delete(planPaths).where(eq(planPaths.id, pathId));
  try {
    notifyPlanChanged();
  } catch {
    /* bus */
  }
  return { ok: true, plan: await getPlanSnapshot() };
}

export async function clearPlan(): Promise<PlanActionState> {
  const gate = await requireOfficer();
  if (!gate.ok) return gate.state;

  await db.delete(planPaths);
  try {
    notifyPlanChanged();
  } catch {
    /* bus */
  }
  return { ok: true, plan: await getPlanSnapshot() };
}

/**
 * Remove this node from the shared plan.
 *
 * 1. On every trail through it: keep the prefix before the cut; drop the node
 *    and the rest of that trail.
 * 2. Tips that were after the cut are re-routed from owned territory **avoiding
 *    the removed node**. If a road still exists (e.g. 82:364 → 131:333 without
 *    133:282), they stay on the plan as a new trail. Only truly stranded tips
 *    disappear.
 * 3. Paths left with fewer than 2 nodes are deleted.
 */
export async function removeNodeFromPlan(
  nodeId: number,
): Promise<PlanActionState> {
  const gate = await requireOfficer();
  if (!gate.ok) return gate.state;
  if (!Number.isInteger(nodeId)) return { ok: false, error: "plan.badTarget" };

  const planningKingdomId = await loadPlanningKingdomId();
  if (planningKingdomId == null) {
    return { ok: false, error: "plan.noKingdom" };
  }

  const allSteps = await db.select().from(planPathNodes);
  const hits = allSteps.filter((s) => s.nodeId === nodeId);
  if (hits.length === 0) {
    return { ok: true, plan: await getPlanSnapshot() };
  }

  // One cut per path (first occurrence — steps are unique per path).
  const cutByPath = new Map<number, number>();
  for (const h of hits) {
    const prev = cutByPath.get(h.pathId);
    if (prev === undefined || h.step < prev) cutByPath.set(h.pathId, h.step);
  }

  // Nodes after the cut on those trails — keep if still reachable without nodeId.
  // Deeper tips first so a long re-route can cover intermediates on the way.
  const tailCandidates: { nodeId: number; step: number }[] = [];
  const seenTail = new Set<number>();
  for (const [pathId, cutStep] of cutByPath) {
    for (const s of allSteps) {
      if (s.pathId !== pathId || s.step <= cutStep) continue;
      if (s.nodeId === nodeId || seenTail.has(s.nodeId)) continue;
      seenTail.add(s.nodeId);
      tailCandidates.push({ nodeId: s.nodeId, step: s.step });
    }
  }
  tailCandidates.sort((a, b) => b.step - a.step);

  for (const [pathId, cutStep] of cutByPath) {
    await db
      .delete(planPathNodes)
      .where(
        and(eq(planPathNodes.pathId, pathId), gte(planPathNodes.step, cutStep)),
      );

    const remaining = await db
      .select({ id: planPathNodes.id })
      .from(planPathNodes)
      .where(eq(planPathNodes.pathId, pathId));

    if (remaining.length < 2) {
      await db.delete(planPaths).where(eq(planPaths.id, pathId));
    }
  }

  if (tailCandidates.length > 0) {
    const nodeRows = await db.select().from(nodes);
    const edgeRows = await db.select().from(edges);
    const avoid = new Set<number>([nodeId]);
    const snap = await getPlanSnapshot();
    const onPlan = new Set(snap.paths.flatMap((p) => p.nodes));
    const existingChains = new Set(snap.paths.map((p) => p.nodes.join(",")));

    let sort =
      (await db.select({ m: max(planPaths.sort) }).from(planPaths))[0]?.m ?? 0;

    for (const { nodeId: tipId } of tailCandidates) {
      // Already covered by a prefix that stayed, or by an earlier re-route.
      if (onPlan.has(tipId)) continue;
      const chain = shortestCapturePath(
        tipId,
        planningKingdomId,
        nodeRows,
        edgeRows,
        { avoid },
      );
      if (!chain || chain.length < 2) continue;
      const key = chain.join(",");
      if (existingChains.has(key)) continue;
      existingChains.add(key);
      for (const id of chain) onPlan.add(id);
      sort += 1;
      const [path] = await db
        .insert(planPaths)
        .values({ sort, createdBy: gate.userId })
        .returning();
      await db.insert(planPathNodes).values(
        chain.map((nid, step) => ({
          pathId: path.id,
          nodeId: nid,
          step,
        })),
      );
    }
  }

  try {
    notifyPlanChanged();
  } catch {
    /* bus */
  }
  return { ok: true, plan: await getPlanSnapshot() };
}

export async function addPlanNote(
  nodeId: number,
  body: string,
): Promise<PlanActionState> {
  const gate = await requireOfficer();
  if (!gate.ok) return gate.state;
  if (!Number.isInteger(nodeId)) return { ok: false, error: "plan.badTarget" };

  const text = (body ?? "").trim().slice(0, MAX_NOTE);
  if (!text) return { ok: false, error: "plan.noteBlank" };

  const [node] = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(eq(nodes.id, nodeId))
    .limit(1);
  if (!node) return { ok: false, error: "plan.badTarget" };

  const me = await getUser();
  if (!me) return { ok: false, error: "auth.denied" };

  await db.insert(planNotes).values({
    nodeId,
    body: text,
    nick: me.nick,
    userId: me.id,
    at: nowSeconds(),
  });

  try {
    notifyPlanChanged();
  } catch {
    /* bus */
  }
  return { ok: true, plan: await getPlanSnapshot() };
}

export async function deletePlanNote(noteId: number): Promise<PlanActionState> {
  const gate = await requireOfficer();
  if (!gate.ok) return gate.state;
  if (!Number.isInteger(noteId)) return { ok: false, error: "plan.badTarget" };

  await db.delete(planNotes).where(eq(planNotes.id, noteId));
  try {
    notifyPlanChanged();
  } catch {
    /* bus */
  }
  return { ok: true, plan: await getPlanSnapshot() };
}

/** Admin: which kingdom the war room routes from. */
export async function setPlanningKingdom(
  kingdomId: number,
): Promise<PlanActionState> {
  if (!canEdit(await getRole())) {
    return { ok: false, error: "auth.denied" };
  }
  if (!(await kingdomExists(kingdomId))) {
    return { ok: false, error: "plan.noKingdom" };
  }

  const [existing] = await db
    .select()
    .from(planSettings)
    .where(eq(planSettings.id, 1))
    .limit(1);
  if (existing) {
    await db
      .update(planSettings)
      .set({ planningKingdomId: kingdomId })
      .where(eq(planSettings.id, 1));
  } else {
    await db.insert(planSettings).values({
      id: 1,
      planningKingdomId: kingdomId,
    });
  }

  try {
    notifyPlanChanged();
  } catch {
    /* bus */
  }
  return { ok: true, plan: await getPlanSnapshot() };
}
