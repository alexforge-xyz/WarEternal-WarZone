import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "./index";
import {
  edges,
  kingdoms,
  nodes,
  type EdgeRow,
  type KingdomRow,
  type NodeRow,
} from "./schema";

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
