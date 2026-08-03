import { Heart, ShieldHalf, Swords } from "lucide-react";
import { BUFF_COLOR } from "@/lib/constants";

/**
 * The three things a held node grants. Same reasoning as the kind glyphs:
 * plain lucide shapes, no publisher art, readable at map zoom.
 */
export const BUFF_ICONS = {
  buffAtk: Swords,
  buffDef: ShieldHalf,
  buffHp: Heart,
} as const;

export type BuffField = keyof typeof BUFF_ICONS;

export const BUFF_FIELDS = ["buffAtk", "buffDef", "buffHp"] as const;

export function BuffIcon({
  field,
  size = 16,
  className,
  colored = true,
}: {
  field: BuffField;
  size?: number;
  className?: string;
  colored?: boolean;
}) {
  const Icon = BUFF_ICONS[field];
  return (
    <Icon
      size={size}
      className={className}
      style={colored ? { color: BUFF_COLOR[field] } : undefined}
      aria-hidden
    />
  );
}

/**
 * What to show for a node in buff mode. Every node in the surveyed map grants
 * at most one kind of buff, so the strongest one is the node's whole story;
 * picking it keeps the map to one glyph per node instead of three.
 */
export function dominantBuff(node: {
  buffAtk: number;
  buffDef: number;
  buffHp: number;
}): { field: BuffField; value: number } | null {
  let best: { field: BuffField; value: number } | null = null;
  for (const field of BUFF_FIELDS) {
    const value = node[field];
    if (value > 0 && (!best || value > best.value)) best = { field, value };
  }
  return best;
}
