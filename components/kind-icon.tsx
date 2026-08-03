import { Castle, Crown, DoorOpen, Flag, TowerControl } from "lucide-react";
import type { NodeKind } from "@/db/schema";
import { KIND_ACCENT } from "@/lib/constants";

/**
 * Plain lucide glyphs stand in for the in-game art on purpose: they stay
 * readable at map zoom and keep the project clear of the publisher's assets.
 */
const ICONS = {
  city: Castle,
  gate: DoorOpen,
  turret: TowerControl,
  castle: Crown,
  base: Flag,
} as const;

export function KindIcon({
  kind,
  size = 16,
  className,
  colored = true,
}: {
  kind: NodeKind;
  size?: number;
  className?: string;
  colored?: boolean;
}) {
  const Icon = ICONS[kind];
  return (
    <Icon
      size={size}
      className={className}
      style={colored ? { color: KIND_ACCENT[kind] } : undefined}
      aria-hidden
    />
  );
}

export { ICONS as KIND_ICONS };
