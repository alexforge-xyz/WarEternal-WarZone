import "server-only";
import { asc, desc, eq, gt } from "drizzle-orm";
import type {
  PlanNoteView,
  PlanPathView,
  PlanSnapshot,
} from "@/lib/plan-types";
import { db } from "./index";
import {
  edges,
  kingdoms,
  messages,
  nodes,
  planNotes,
  planPathNodes,
  planPaths,
  planSettings,
  type EdgeRow,
  type KingdomRow,
  type MessageRow,
  type NodeRow,
  type PlanPathNodeRow,
  type PlanPathRow,
  type PlanSettingsRow,
} from "./schema";

export type { PlanNoteView, PlanPathView, PlanSnapshot };

export async function getNodes(): Promise<NodeRow[]> {
  return db.select().from(nodes).orderBy(asc(nodes.name));
}

export async function getEdges(): Promise<EdgeRow[]> {
  return db.select().from(edges);
}

export async function getKingdoms(): Promise<KingdomRow[]> {
  return db
    .select()
    .from(kingdoms)
    .orderBy(asc(kingdoms.sort), asc(kingdoms.id));
}

/** Validates an owner id coming off the wire — the line-up is data now. */
export async function kingdomExists(id: number): Promise<boolean> {
  if (!Number.isInteger(id)) return false;
  const [row] = await db
    .select({ id: kingdoms.id })
    .from(kingdoms)
    .where(eq(kingdoms.id, id))
    .limit(1);
  return Boolean(row);
}

export type MapData = { nodes: NodeRow[]; edges: EdgeRow[] };

export async function getMapData(): Promise<MapData> {
  const [n, e] = await Promise.all([getNodes(), getEdges()]);
  return { nodes: n, edges: e };
}

/** How much of the war room a freshly opened tab gets. */
export const CHAT_PAGE = 60;

/**
 * Last lines of the officer chat, oldest first — the order they are rendered
 * in, so the client never has to reverse a list it just received.
 */
export async function getRecentMessages(
  limit = CHAT_PAGE,
): Promise<MessageRow[]> {
  const rows = await db
    .select()
    .from(messages)
    .orderBy(desc(messages.id))
    .limit(limit);
  return rows.reverse();
}

/**
 * Everything written after `afterId`. This is the catch-up path: a phone that
 * slept through a few messages reconnects and asks for the gap instead of
 * re-downloading the room.
 */
export async function getMessagesAfter(
  afterId: number,
  limit = CHAT_PAGE,
): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(gt(messages.id, afterId))
    .orderBy(asc(messages.id))
    .limit(limit);
}

/* ------------------------------ capture plan ------------------------------ */

/** Default planning kingdom: in-game number 6 (K6), else first kingdom row. */
export async function resolveDefaultPlanningKingdomId(): Promise<number | null> {
  const list = await getKingdoms();
  if (list.length === 0) return null;
  return list.find((k) => k.number === 6)?.id ?? list[0]!.id;
}

/**
 * War-room planning kingdom. Creates the single settings row on first read
 * so officers always have an anchor without an admin visit.
 */
export async function getPlanSettings(): Promise<{
  planningKingdomId: number | null;
  row: PlanSettingsRow | null;
}> {
  const [row] = await db
    .select()
    .from(planSettings)
    .where(eq(planSettings.id, 1))
    .limit(1);
  if (row) {
    return { planningKingdomId: row.planningKingdomId, row };
  }
  const fallback = await resolveDefaultPlanningKingdomId();
  await db.insert(planSettings).values({
    id: 1,
    planningKingdomId: fallback,
  });
  return { planningKingdomId: fallback, row: null };
}

export async function getPlanSnapshot(): Promise<PlanSnapshot> {
  const { planningKingdomId } = await getPlanSettings();
  const [paths, steps, noteRows] = await Promise.all([
    db.select().from(planPaths).orderBy(asc(planPaths.sort), asc(planPaths.id)),
    db
      .select()
      .from(planPathNodes)
      .orderBy(asc(planPathNodes.pathId), asc(planPathNodes.step)),
    db.select().from(planNotes).orderBy(asc(planNotes.at), asc(planNotes.id)),
  ]);

  const byPath = new Map<number, number[]>();
  for (const s of steps) {
    const list = byPath.get(s.pathId);
    if (list) list.push(s.nodeId);
    else byPath.set(s.pathId, [s.nodeId]);
  }

  const notes: PlanNoteView[] = noteRows.map((n) => ({
    id: n.id,
    nodeId: n.nodeId,
    body: n.body,
    nick: n.nick,
    at: n.at,
  }));

  return {
    planningKingdomId,
    paths: paths.map((p: PlanPathRow) => ({
      id: p.id,
      label: p.label,
      sort: p.sort,
      nodes: byPath.get(p.id) ?? [],
    })),
    notes,
  };
}

export type { PlanPathNodeRow };
