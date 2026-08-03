import type { NodeKind } from "@/db/schema";
import type { MessageKey } from "./i18n";

export const PROJECT_NAME = "War Eternal — WarZone";
export const AUTHOR = "[K6] TheMrLordicus";
/** Public display name of the person behind the site. */
export const AUTHOR_NAME = "Alex";
/** In-game nick of the author (Kingdom 6). */
export const AUTHOR_NICK = "TheMrLordicus";
export const AUTHOR_KINGDOM = "K6";
/** Brand under which the site is published. */
export const BRAND = "alexforge";
/** Live hostname (subdomain on the alexforge droplet). */
export const SITE_DOMAIN = "warzone.alexforge.xyz";
export const CONTACT_EMAIL = "contact@alexforge.xyz";
/** Public source repository. */
export const GITHUB_URL =
  "https://github.com/alexforge-xyz/WarEternal-WarZone";
/** Ko-fi tip jar — opens in a new tab from the header. */
export const KOFI_URL = "https://ko-fi.com/themrlordicus";
/** Game publisher — not affiliated with this fan project. */
export const GAME_PUBLISHER = "ONEMT";
export const GAME_NAME = "War Eternal";
export const EVENT_NAME = "WarZone";

/** Colours only — all labels live in `lib/i18n.ts`. */
export const KIND_ACCENT: Record<NodeKind, string> = {
  city: "#38bdf8",
  gate: "#a78bfa",
  turret: "#fb923c",
  castle: "#facc15",
  base: "#f472b6",
};

/**
 * Kingdom colours are stored per kingdom in the database; this is the palette
 * the admin picks from. Every entry is legible on the dark map, distinguishable
 * from the neutral grey, and far enough from its neighbours to tell apart on a
 * phone — a free colour picker gives none of that.
 */
export const KINGDOM_PALETTE = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#eab308", // yellow
  "#a855f7", // violet
  "#f97316", // orange
  "#14b8a6", // teal
  "#ec4899", // pink
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#f43f5e", // rose
  "#8b5cf6", // purple
] as const;

/** Anything unowned, and the fallback for a colour that failed validation. */
export const NEUTRAL_COLOR = "#64748b";

/**
 * A fight in progress. Deliberately outside `KINGDOM_PALETTE` — the crossed
 * swords are drawn over a node's disc, and a hue a kingdom could also be
 * wearing would read as "this node is orange" rather than "this node is
 * under attack".
 */
export const BATTLE_COLOR = "#ff6b3d";

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(v: string): boolean {
  return HEX.test(v);
}

/** What a kingdom is called when it has no custom name: "K6". */
export function kingdomShort(k: { number: number; name: string | null }): string {
  return k.name?.trim() || `K${k.number}`;
}

export const KIND_KEY: Record<NodeKind, MessageKey> = {
  city: "kind.city",
  gate: "kind.gate",
  turret: "kind.turret",
  castle: "kind.castle",
  base: "kind.base",
};

export const KIND_SHORT_KEY: Record<NodeKind, MessageKey> = {
  city: "kind.city.short",
  gate: "kind.gate.short",
  turret: "kind.turret.short",
  castle: "kind.castle.short",
  base: "kind.base.short",
};

/** Attack / defence / HP, kept apart from the kingdom colours on purpose. */
export const BUFF_COLOR = {
  buffAtk: "#f87171",
  buffDef: "#60a5fa",
  buffHp: "#4ade80",
} as const;

export const BUFF_KEY = {
  buffAtk: "buff.atk",
  buffDef: "buff.def",
  buffHp: "buff.hp",
} as const satisfies Record<string, MessageKey>;

export const BUFF_SHORT_KEY = {
  buffAtk: "buff.atk.short",
  buffDef: "buff.def.short",
  buffHp: "buff.hp.short",
} as const satisfies Record<string, MessageKey>;

export const CRYSTAL_KEY = {
  amethyst: "crystal.amethyst",
  sapphire: "crystal.sapphire",
} as const satisfies Record<string, MessageKey>;

export const CRYSTAL_SHORT_KEY = {
  amethyst: "crystal.amethyst.short",
  sapphire: "crystal.sapphire.short",
} as const satisfies Record<string, MessageKey>;

/** Percent without a trailing ".0"; em dash for zero so columns stay quiet. */
export function pct(v: number): string {
  if (!v) return "—";
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}
