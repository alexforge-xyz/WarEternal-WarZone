"use server";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { changes, nodes, type Kingdom } from "@/db/schema";
import { kingdomExists } from "@/db/queries";
import { getRole } from "@/lib/auth";
import { notifyMapChanged } from "@/lib/live-server";
import { canMonitor } from "@/lib/roles";
import { needsCheck, nowSeconds } from "@/lib/staleness";
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

/**
 * Announce the write — and *only* announce it.
 *
 * This used to `revalidatePath` four routes. All four are `force-dynamic`, so
 * nothing was cached to bust; what it actually did was make Next re-render and
 * re-stream the whole map page on every single tap, 231 nodes and 352 roads,
 * on top of the snapshot the client was already pulling. Three refreshes for
 * one changed field, and the tap sat there looking ignored while they landed.
 *
 * Freshness is the live channel's job: `notifyMapChanged` bumps the version,
 * every open tab pulls `/api/map`, and the tab that wrote pulls immediately
 * without waiting for its own event. Other routes are dynamic, so a later
 * navigation renders them from the database regardless.
 */
function revalidate() {
  notifyMapChanged();
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
  // Recording who holds it is how a fight ends, so the battle mark comes off
  // with the same tap. Leaving it to a second button would mean every taken
  // node stayed "under attack" until somebody remembered — and a marker that
  // is usually wrong is worse than none.
  await db
    .update(nodes)
    .set({ owner: owner as Kingdom | null, checkedAt: at, battleSince: null })
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

/**
 * Confirm every node currently flagged for a re-check, in one write.
 *
 * Most of the flagged list is usually nodes deep inside somebody's territory
 * that physically cannot have changed hands — nothing borders them but their
 * owner's own cities. Clearing those one tap at a time is a hundred taps of
 * pure noise, and the predictable result is that officers stop clearing any of
 * them and the flag stops meaning anything.
 *
 * Only nodes that actually need a check are touched: a shielded node is not
 * flagged in the first place (see `needsCheck`), and a node confirmed an hour
 * ago keeps its own, more honest, timestamp instead of being backdated to now.
 *
 * One log row, not one per node. 200 identical `confirm` lines would bury the
 * ownership changes the log exists to show; the count is the interesting part.
 */
export async function confirmAllStale(
  by?: string | null,
): Promise<ActionState & { count?: number }> {
  const denied = await guard();
  if (denied) return denied;

  const at = nowSeconds();
  const rows = await db
    .select({
      id: nodes.id,
      checkedAt: nodes.checkedAt,
      shieldUntil: nodes.shieldUntil,
    })
    .from(nodes);

  const ids = rows
    .filter((r) => needsCheck(r.checkedAt, r.shieldUntil, at))
    .map((r) => r.id);
  if (ids.length === 0) return { ok: true, count: 0 };

  await db.update(nodes).set({ checkedAt: at }).where(inArray(nodes.id, ids));
  await db.insert(changes).values({
    nodeId: ids[0],
    kind: "confirm",
    by: author(by),
    at,
  });

  revalidate();
  return { ok: true, count: ids.length };
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

/**
 * Flag a node as being fought over, or call the fight off.
 *
 * Deliberately not a duration: nothing in the game says how long a battle
 * runs, so guessing one would put a countdown on the map that means nothing.
 * `setOwner` clears it, which is the path this normally leaves by.
 *
 * Turning it on refreshes `checkedAt` — somebody just looked at the node,
 * which is exactly what that field records.
 */
export async function setBattle(
  nodeId: number,
  on: boolean,
  by?: string | null,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(nodeId)) return { ok: false, error: "err.bad_id" };

  const at = nowSeconds();
  await db
    .update(nodes)
    .set({ battleSince: on ? at : null, checkedAt: at })
    .where(eq(nodes.id, nodeId));
  await db
    .insert(changes)
    .values({ nodeId, kind: "battle", by: author(by), at });

  revalidate();
  return { ok: true };
}
