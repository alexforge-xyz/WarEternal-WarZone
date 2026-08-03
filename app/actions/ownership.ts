"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { changes, nodes, type Kingdom } from "@/db/schema";
import { kingdomExists } from "@/db/queries";
import { getRole } from "@/lib/auth";
import { canMonitor } from "@/lib/roles";
import { nowSeconds } from "@/lib/staleness";
import type { ActionState } from "./nodes";

/** Monitoring the map is open from `helper` upwards. */
async function guard(): Promise<ActionState | null> {
  return canMonitor(await getRole())
    ? null
    : { ok: false, error: "auth.denied" };
}

/** Self-declared nickname from the client; trimmed and length-capped. */
function author(by: string | null | undefined): string | null {
  const v = (by ?? "").trim().slice(0, 40);
  return v || null;
}


function revalidate() {
  revalidatePath("/");
  revalidatePath("/map");
  revalidatePath("/links");
  revalidatePath("/stats");
}

/**
 * Set who holds a node. Always refreshes `checkedAt`, and only writes a log
 * row when the owner actually moved — confirmations are logged separately.
 */
export async function setOwner(
  nodeId: number,
  owner: number | null,
  by?: string | null,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(nodeId)) return { ok: false, error: "err.bad_id" };
  if (owner !== null && !(await kingdomExists(owner))) {
    return { ok: false, error: "err.kingdom_range" };
  }

  const [current] = await db
    .select({ owner: nodes.owner })
    .from(nodes)
    .where(eq(nodes.id, nodeId))
    .limit(1);
  if (!current) return { ok: false, error: "err.bad_id" };

  const at = nowSeconds();
  await db
    .update(nodes)
    .set({ owner: owner as Kingdom | null, checkedAt: at })
    .where(eq(nodes.id, nodeId));

  if (current.owner !== owner) {
    await db.insert(changes).values({
      nodeId,
      kind: "owner",
      fromOwner: current.owner,
      toOwner: owner as Kingdom | null,
      by: author(by),
      at,
    });
  }

  revalidate();
  return { ok: true };
}

/** "Checked, nothing changed" — the button that lets a quiet node go green. */
export async function confirmNode(
  nodeId: number,
  by?: string | null,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(nodeId)) return { ok: false, error: "err.bad_id" };

  const at = nowSeconds();
  await db.update(nodes).set({ checkedAt: at }).where(eq(nodes.id, nodeId));
  await db
    .insert(changes)
    .values({ nodeId, kind: "confirm", by: author(by), at });

  revalidate();
  return { ok: true };
}

/** Long shields are read off the game in days, so the cap is one too. */
const MAX_SHIELD_DAYS = 30;

/**
 * Store the shield as the absolute moment it drops, computed from a duration
 * the officer reads off the game. Every client then counts down to the same
 * instant. An all-zero duration clears the shield.
 */
export async function setShield(
  nodeId: number,
  days: number,
  hours: number,
  minutes: number,
  by?: string | null,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(nodeId)) return { ok: false, error: "err.bad_id" };

  const parts = [days, hours, minutes];
  if (parts.some((v) => !Number.isFinite(v) || v < 0)) {
    return { ok: false, error: "err.shield_range" };
  }

  // Checked on the total, not per field: "36 hours" is a perfectly ordinary
  // thing to type and must not be rejected for exceeding a day.
  const seconds = Math.round(days * 86400 + hours * 3600 + minutes * 60);
  if (seconds > MAX_SHIELD_DAYS * 86400) {
    return { ok: false, error: "err.shield_range" };
  }

  const at = nowSeconds();
  const shieldUntil = seconds > 0 ? at + seconds : null;

  await db
    .update(nodes)
    .set({ shieldUntil, checkedAt: at })
    .where(eq(nodes.id, nodeId));
  await db
    .insert(changes)
    .values({ nodeId, kind: "shield", by: author(by), at });

  revalidate();
  return { ok: true };
}

export async function clearShield(
  nodeId: number,
  by?: string | null,
): Promise<ActionState> {
  return setShield(nodeId, 0, 0, 0, by);
}
