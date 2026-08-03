"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { kingdomExists } from "@/db/queries";
import { NODE_KINDS, nodes, type Kingdom, type NodeKind } from "@/db/schema";
import { getRole } from "@/lib/auth";
import { notifyMapChanged } from "@/lib/live-server";
import { canEdit } from "@/lib/roles";
import type { MessageKey, Params } from "@/lib/i18n";

/**
 * Actions return message *keys*, not sentences — the client renders them in
 * whatever interface language the officer picked.
 */
export type ActionState = {
  ok: boolean;
  error?: MessageKey;
  message?: MessageKey;
  params?: Params;
};

function num(fd: FormData, key: string): number {
  // Accept both "5" and "5,5" — the comma is what many keyboards produce.
  const raw = String(fd.get(key) ?? "").trim().replace(",", ".");
  if (!raw) return 0;
  const v = Number(raw);
  return Number.isFinite(v) ? v : NaN;
}

/** An optional whole number: empty means "use the derived value". */
function optInt(fd: FormData, key: string): number | null | "bad" {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 0) return "bad";
  return v;
}

type ParsedNode = {
  name: string;
  x: number;
  y: number;
  kind: NodeKind;
  kingdom: Kingdom | null;
  level: number;
  buffAtk: number;
  buffDef: number;
  buffHp: number;
  amethystOverride: number | null;
  sapphireOverride: number | null;
  notes: string | null;
};

function parse(fd: FormData): ParsedNode | MessageKey {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return "err.name_required";

  const x = num(fd, "x");
  const y = num(fd, "y");
  if (!Number.isInteger(x) || !Number.isInteger(y)) return "err.coords_int";

  const kind = String(fd.get("kind") ?? "") as NodeKind;
  if (!NODE_KINDS.includes(kind)) return "err.kind_required";

  // Existence is checked against the kingdoms table by the caller — `parse`
  // stays synchronous.
  const kingdomRaw = String(fd.get("kingdom") ?? "").trim();
  let kingdom: Kingdom | null = null;
  if (kingdomRaw) {
    const k = Number(kingdomRaw);
    if (!Number.isInteger(k)) return "err.kingdom_range";
    kingdom = k;
  }
  if (kind === "base" && kingdom === null) return "err.base_needs_kingdom";

  const level = num(fd, "level") || 1;
  if (!Number.isInteger(level) || level < 1) return "err.level_int";

  const buffAtk = num(fd, "buffAtk");
  const buffDef = num(fd, "buffDef");
  const buffHp = num(fd, "buffHp");
  if ([buffAtk, buffDef, buffHp].some((v) => !Number.isFinite(v) || v < 0)) {
    return "err.buff_nonneg";
  }

  const amethystOverride = optInt(fd, "amethystOverride");
  const sapphireOverride = optInt(fd, "sapphireOverride");
  if (amethystOverride === "bad" || sapphireOverride === "bad") {
    return "err.crystal_int";
  }

  const notes = String(fd.get("notes") ?? "").trim() || null;

  return {
    name,
    x,
    y,
    kind,
    kingdom,
    level,
    buffAtk,
    buffDef,
    buffHp,
    amethystOverride,
    sapphireOverride,
    notes,
  };
}

/** SQLite reports the (x, y) unique index; turn that into a readable message. */
function failure(err: unknown, x: number, y: number): ActionState {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("UNIQUE") && msg.includes("nodes")) {
    return { ok: false, error: "err.dup_xy", params: { x, y } };
  }
  return { ok: false, error: "err.save_failed", params: { detail: msg } };
}

function revalidate() {
  revalidatePath("/");
  revalidatePath("/nodes");
  revalidatePath("/links");
  revalidatePath("/stats");
  notifyMapChanged();
}

/** The static map is admin-only; the UI hides it, the server enforces it. */
async function guard(): Promise<ActionState | null> {
  return canEdit(await getRole()) ? null : { ok: false, error: "auth.denied" };
}

/** The line-up is a table now, so a kingdom id has to be looked up. */
async function checkKingdom(id: Kingdom | null): Promise<ActionState | null> {
  if (id === null) return null;
  return (await kingdomExists(id))
    ? null
    : { ok: false, error: "err.kingdom_range" };
}

export async function createNode(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const parsed = parse(fd);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  const badKingdom = await checkKingdom(parsed.kingdom);
  if (badKingdom) return badKingdom;

  try {
    await db.insert(nodes).values(parsed);
  } catch (err) {
    return failure(err, parsed.x, parsed.y);
  }

  revalidate();
  return {
    ok: true,
    message: "msg.node_added",
    params: { name: parsed.name, x: parsed.x, y: parsed.y },
  };
}

export async function updateNode(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "err.bad_id" };

  const parsed = parse(fd);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  const badKingdom = await checkKingdom(parsed.kingdom);
  if (badKingdom) return badKingdom;

  try {
    await db.update(nodes).set(parsed).where(eq(nodes.id, id));
  } catch (err) {
    return failure(err, parsed.x, parsed.y);
  }

  revalidate();
  return { ok: true, message: "msg.node_saved", params: { name: parsed.name } };
}

/**
 * Single entry point for the form: an `id` in the payload means edit,
 * its absence means create. Keeps the client from swapping actions mid-render.
 */
export async function saveNode(
  prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return String(fd.get("id") ?? "").trim()
    ? updateNode(prev, fd)
    : createNode(prev, fd);
}

export async function deleteNode(id: number): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(id)) return { ok: false, error: "err.bad_id" };

  // Roads to this node go with it (onDelete: cascade in the schema).
  await db.delete(nodes).where(eq(nodes.id, id));

  revalidate();
  return { ok: true };
}
