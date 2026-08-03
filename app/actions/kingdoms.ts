"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { kingdoms, nodes } from "@/db/schema";
import { getRole } from "@/lib/auth";
import { canEdit } from "@/lib/roles";
import { isHexColor } from "@/lib/constants";
import type { ActionState } from "./nodes";

/**
 * The line-up on the map: which kingdoms are fighting, what they are called and
 * what colour they wear. Admin-only, like the rest of the static map — an
 * officer recolouring the board mid-event would scramble what everyone reads.
 */
async function guard(): Promise<ActionState | null> {
  return canEdit(await getRole()) ? null : { ok: false, error: "auth.denied" };
}

function revalidate() {
  revalidatePath("/");
  revalidatePath("/map");
  revalidatePath("/links");
  revalidatePath("/stats");
}

type Parsed = {
  number: number;
  name: string | null;
  color: string;
  baseId: number | null;
};

function parse(fd: FormData): Parsed | { error: ActionState["error"] } {
  const number = Number(String(fd.get("number") ?? "").trim());
  if (!Number.isInteger(number) || number < 1 || number > 99999) {
    return { error: "err.kingdom_number" };
  }

  const name = String(fd.get("name") ?? "").trim().slice(0, 32) || null;

  const color = String(fd.get("color") ?? "").trim().toLowerCase();
  if (!isHexColor(color)) return { error: "err.color_hex" };

  const baseRaw = String(fd.get("baseId") ?? "").trim();
  const baseId = baseRaw ? Number(baseRaw) : null;
  if (baseId !== null && !Number.isInteger(baseId)) {
    return { error: "err.bad_id" };
  }

  return { number, name, color, baseId };
}

/**
 * Point a kingdom at its home base, and make sure it is the only one: a base
 * belongs to exactly one kingdom, so claiming it releases whatever the kingdom
 * held before.
 */
async function assignBase(kingdomId: number, baseId: number | null) {
  await db
    .update(nodes)
    .set({ kingdom: null })
    .where(and(eq(nodes.kingdom, kingdomId), eq(nodes.kind, "base")));

  if (baseId === null) return null;

  const [node] = await db
    .select({ id: nodes.id, kind: nodes.kind })
    .from(nodes)
    .where(eq(nodes.id, baseId))
    .limit(1);
  if (!node || node.kind !== "base") return "err.base_not_found" as const;

  await db.update(nodes).set({ kingdom: kingdomId }).where(eq(nodes.id, baseId));
  return null;
}

/** SQLite reports the unique index on `number`; say which number clashed. */
function failure(err: unknown, number: number): ActionState {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("UNIQUE") && msg.includes("kingdoms")) {
    return { ok: false, error: "err.kingdom_dup", params: { n: number } };
  }
  return { ok: false, error: "err.save_failed", params: { detail: msg } };
}

export async function saveKingdom(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const parsed = parse(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const idRaw = String(fd.get("id") ?? "").trim();
  const id = idRaw ? Number(idRaw) : null;
  if (id !== null && !Number.isInteger(id)) {
    return { ok: false, error: "err.bad_id" };
  }

  let kingdomId: number;
  try {
    if (id === null) {
      const [{ next }] = await db
        .select({ next: sql<number>`coalesce(max(${kingdoms.sort}), -1) + 1` })
        .from(kingdoms);
      const [row] = await db
        .insert(kingdoms)
        .values({
          number: parsed.number,
          name: parsed.name,
          color: parsed.color,
          sort: next,
        })
        .returning({ id: kingdoms.id });
      kingdomId = row.id;
    } else {
      const [row] = await db
        .update(kingdoms)
        .set({
          number: parsed.number,
          name: parsed.name,
          color: parsed.color,
        })
        .where(eq(kingdoms.id, id))
        .returning({ id: kingdoms.id });
      if (!row) return { ok: false, error: "err.bad_id" };
      kingdomId = row.id;
    }
  } catch (err) {
    return failure(err, parsed.number);
  }

  const baseError = await assignBase(kingdomId, parsed.baseId);
  if (baseError) return { ok: false, error: baseError };

  revalidate();
  return { ok: true, message: "msg.kingdom_saved" };
}

/**
 * Remove a kingdom from the board. Everything it held becomes neutral rather
 * than pointing at a row that is gone; the change log keeps its old id, which
 * is a historical fact and stays readable as a bare number.
 */
export async function deleteKingdom(id: number): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(id)) return { ok: false, error: "err.bad_id" };

  const rest = await db
    .select({ id: kingdoms.id })
    .from(kingdoms)
    .where(ne(kingdoms.id, id))
    .limit(1);
  if (rest.length === 0) return { ok: false, error: "err.kingdom_last" };

  await db.update(nodes).set({ owner: null }).where(eq(nodes.owner, id));
  await db.update(nodes).set({ kingdom: null }).where(eq(nodes.kingdom, id));
  await db.delete(kingdoms).where(eq(kingdoms.id, id));

  revalidate();
  return { ok: true };
}
