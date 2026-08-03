/**
 * Declaration cost in "horns" (рога) — what you blow into, not the animal.
 *
 * Working rules from officers until the game publishes a full table:
 * - **Cities (and other non-gates):** level N → N horns.
 * - **Gates:** always **1** horn (confirmed for Lv.6 gates; same for any gate
 *   level until something says otherwise — never "6 horns for a Lv.6 gate").
 *
 * Tiers from 3 up on non-gates are still provisional — the UI can flag that,
 * but we never blank the whole sum with "?" for a normal path.
 */

import type { NodeKind } from "@/db/schema";

/** Levels 1–2 treated as firm; from this level the UI may say "estimate". */
export const HORNS_PROVISIONAL_FROM = 3;

export type HornsSource = { kind: NodeKind; level: number };

/**
 * Horns to declare for one map object.
 * Returns null only for garbage data (missing / non-positive level).
 */
export function hornsForNode(node: HornsSource): number | null {
  const lv = Math.trunc(Number(node.level));
  if (!Number.isFinite(lv) || lv < 1) return null;

  // Gates need a declaration, but only one horn — not "level" horns.
  if (node.kind === "gate") return 1;

  return lv;
}

/** @deprecated Prefer `hornsForNode` — level alone is wrong for gates. */
export function hornsForLevel(level: number): number | null {
  return hornsForNode({ kind: "city", level });
}

export function hornsAreProvisional(node: HornsSource): boolean {
  if (node.kind === "gate") return false; // gate = 1 is confirmed
  const lv = Math.trunc(Number(node.level));
  return Number.isFinite(lv) && lv >= HORNS_PROVISIONAL_FROM;
}
