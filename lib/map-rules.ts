import type { NodeKind } from "@/db/schema";

/**
 * The map is fixed: an object's level determines what it is.
 *
 *   1–5  city    (the only objects with crystal mines)
 *   6    gate
 *   7    turret
 *   8    main castle, one of them, at the centre of the map
 *
 * Kingdom bases sit outside this scale, so the form lets the officer override
 * the derived type rather than deriving it unconditionally.
 */
export const MAX_CITY_LEVEL = 5;
export const GATE_LEVEL = 6;
export const TURRET_LEVEL = 7;
export const CASTLE_LEVEL = 8;

/** `null` for levels the rule says nothing about. */
export function kindForLevel(level: number): NodeKind | null {
  if (!Number.isInteger(level)) return null;
  if (level >= 1 && level <= MAX_CITY_LEVEL) return "city";
  if (level === GATE_LEVEL) return "gate";
  if (level === TURRET_LEVEL) return "turret";
  if (level === CASTLE_LEVEL) return "castle";
  return null;
}

/** True when the chosen type is what the level rule would have picked. */
export function matchesRule(kind: NodeKind, level: number): boolean {
  return kindForLevel(level) === kind;
}
