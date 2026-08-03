"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { edges, normalizePair } from "@/db/schema";
import { getRole } from "@/lib/auth";
import { notifyMapChanged } from "@/lib/live-server";
import { canEdit } from "@/lib/roles";
import type { ActionState } from "./nodes";

/** Roads are static map data — admin only. */
async function guard(): Promise<ActionState | null> {
  return canEdit(await getRole()) ? null : { ok: false, error: "auth.denied" };
}

function revalidate() {
  revalidatePath("/");
  revalidatePath("/links");
  revalidatePath("/map");
  notifyMapChanged();
}

/**
 * Toggle a road between two nodes. Clicking the same pair again removes it,
 * which is what makes the linking screen forgiving to work in.
 */
export async function toggleEdge(
  aRaw: number,
  bRaw: number,
): Promise<ActionState & { linked?: boolean }> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(aRaw) || !Number.isInteger(bRaw)) {
    return { ok: false, error: "err.bad_id" };
  }
  if (aRaw === bRaw) return { ok: false, error: "err.self_link" };

  const [aId, bId] = normalizePair(aRaw, bRaw);

  const existing = await db
    .select({ id: edges.id })
    .from(edges)
    .where(and(eq(edges.aId, aId), eq(edges.bId, bId)))
    .limit(1);

  if (existing.length) {
    await db.delete(edges).where(eq(edges.id, existing[0].id));
    revalidate();
    return { ok: true, linked: false };
  }

  await db.insert(edges).values({ aId, bId });
  revalidate();
  return { ok: true, linked: true };
}

export async function deleteEdge(id: number): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(id)) return { ok: false, error: "err.bad_id" };
  await db.delete(edges).where(eq(edges.id, id));
  revalidate();
  return { ok: true };
}
