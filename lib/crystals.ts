import type { NodeKind } from "@/db/schema";

/**
 * Crystal economy.
 *
 * Yield depends only on mine level and is the same table for both crystal
 * types, so it is derived rather than entered by hand. A node can still carry
 * an explicit override for the cases the rules below do not cover.
 */

/** Per hour, by mine level. Levels above this were not observed in game yet. */
export const YIELD_BY_LEVEL: Record<number, number> = {
  1: 60,
  2: 120,
  3: 240,
  4: 360,
  5: 480,
};

export const MAX_KNOWN_LEVEL = 5;

export const CRYSTAL_COLOR = {
  amethyst: "#a855f7",
  sapphire: "#3b82f6",
} as const;

/** `null` means the level is outside the known table — not that it yields 0. */
export function yieldForLevel(level: number): number | null {
  return YIELD_BY_LEVEL[level] ?? null;
}

/** Gates, turrets and the main castle cannot be gathered on. */
export function hasMines(kind: NodeKind): boolean {
  return kind === "city" || kind === "base";
}

export type Yield = { amethyst: number | null; sapphire: number | null };

export function derivedYield(kind: NodeKind, level: number): Yield {
  // Every city holds one amethyst mine and one sapphire mine, both at the
  // city's own level.
  if (kind === "city") {
    const v = yieldForLevel(level);
    return { amethyst: v, sapphire: v };
  }
  // The kingdom base is the exception: a single level-1 sapphire, no amethyst.
  if (kind === "base") return { amethyst: 0, sapphire: YIELD_BY_LEVEL[1] };
  return { amethyst: 0, sapphire: 0 };
}

type YieldSource = {
  kind: NodeKind;
  level: number;
  amethystOverride: number | null;
  sapphireOverride: number | null;
};

export function effectiveYield(node: YieldSource): Yield {
  const derived = derivedYield(node.kind, node.level);
  return {
    amethyst: node.amethystOverride ?? derived.amethyst,
    sapphire: node.sapphireOverride ?? derived.sapphire,
  };
}
