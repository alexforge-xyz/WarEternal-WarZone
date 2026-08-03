"use client";

import { createContext, useContext, useMemo } from "react";
import { NEUTRAL_COLOR, kingdomShort } from "@/lib/constants";
import { useT } from "./i18n-provider";

/** What the client needs about a kingdom — the storage row minus its ordering. */
export type KingdomInfo = {
  id: number;
  number: number;
  name: string | null;
  color: string;
};

type Ctx = {
  /** In display order. Four in a normal event, but never assume the count. */
  list: KingdomInfo[];
  get: (id: number | null | undefined) => KingdomInfo | undefined;
  /** Owner colour, falling back to the neutral grey for "nobody". */
  colorOf: (id: number | null | undefined) => string;
  /** "K6" or the custom name — for buttons, badges and tallies. */
  shortOf: (id: number | null | undefined) => string;
  /** "Kingdom 6" or the custom name — for prose and dropdowns. */
  labelOf: (id: number | null | undefined) => string;
};

const KingdomsCtx = createContext<Ctx | null>(null);

const EMPTY: KingdomInfo[] = [];

/**
 * The line-up is data, not a constant: an admin renames kingdoms and recolours
 * them between events, so every screen reads it from here rather than from a
 * table baked into the bundle.
 */
export function KingdomsProvider({
  kingdoms,
  children,
}: {
  kingdoms: KingdomInfo[];
  children: React.ReactNode;
}) {
  const { t } = useT();

  const value = useMemo<Ctx>(() => {
    const byId = new Map(kingdoms.map((k) => [k.id, k]));
    const get = (id: number | null | undefined) =>
      id === null || id === undefined ? undefined : byId.get(id);
    return {
      list: kingdoms,
      get,
      colorOf: (id) => get(id)?.color ?? NEUTRAL_COLOR,
      shortOf: (id) => {
        const k = get(id);
        // A kingdom deleted while someone had the page open still has to render.
        return k ? kingdomShort(k) : "—";
      },
      labelOf: (id) => {
        const k = get(id);
        if (!k) return t("own.free");
        return k.name?.trim() || t("kingdom.n", { n: k.number });
      },
    };
  }, [kingdoms, t]);

  return (
    <KingdomsCtx.Provider value={value}>{children}</KingdomsCtx.Provider>
  );
}

export function useKingdoms(): Ctx {
  const ctx = useContext(KingdomsCtx);
  const { t } = useT();
  return useMemo<Ctx>(
    () =>
      ctx ?? {
        list: EMPTY,
        get: () => undefined,
        colorOf: () => NEUTRAL_COLOR,
        shortOf: () => "—",
        labelOf: () => t("own.free"),
      },
    [ctx, t],
  );
}
