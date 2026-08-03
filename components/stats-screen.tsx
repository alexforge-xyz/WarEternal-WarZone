"use client";

import { useMemo } from "react";
import type { NodeRow } from "@/db/schema";

import { CRYSTAL_SHORT_KEY, pct } from "@/lib/constants";
import { CRYSTAL_COLOR, effectiveYield } from "@/lib/crystals";
import { useT } from "./i18n-provider";
import { useKingdoms } from "./kingdoms-provider";

type Row = {
  key: string;
  label: string;
  color: string;
  nodes: number;
  cities: number;
  amethyst: number;
  sapphire: number;
  atk: number;
  def: number;
  hp: number;
};

/** Public scoreboard: what every kingdom currently earns and gains. */
export function StatsScreen({ nodes }: { nodes: NodeRow[] }) {
  const { t, n: fmt } = useT();
  const { list: kingdomList, labelOf } = useKingdoms();

  const { rows, neutral, total } = useMemo(() => {
    const blank = () => ({
      nodes: 0,
      cities: 0,
      amethyst: 0,
      sapphire: 0,
      atk: 0,
      def: 0,
      hp: 0,
    });
    const acc: Record<number, ReturnType<typeof blank>> = Object.fromEntries(
      kingdomList.map((k) => [k.id, blank()]),
    );
    const free = blank();

    for (const node of nodes) {
      // Held by a kingdom that has left the map? Counts as neutral.
      const bucket = (node.owner !== null && acc[node.owner]) || free;
      const y = effectiveYield(node);
      bucket.nodes += 1;
      if (node.kind === "city") bucket.cities += 1;
      bucket.amethyst += y.amethyst ?? 0;
      bucket.sapphire += y.sapphire ?? 0;
      // Buffs stack additively, so summing the percentages is the real total.
      bucket.atk += node.buffAtk;
      bucket.def += node.buffDef;
      bucket.hp += node.buffHp;
    }

    const rows: Row[] = kingdomList.map((k) => ({
      key: `k${k.id}`,
      label: labelOf(k.id),
      color: k.color,
      ...acc[k.id],
    }));

    return { rows, neutral: free, total: nodes.length };
  }, [nodes, kingdomList, labelOf]);

  return (
    <div className="mx-auto max-w-[1100px] px-3 py-5 sm:px-4">
      <h1 className="mb-1 text-lg font-semibold">{t("st.title")}</h1>
      <p className="mb-4 text-xs text-[var(--color-text-dim)]">{t("st.note")}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="rounded-xl border bg-[var(--color-panel)] p-4"
            style={{ borderColor: `${row.color}55` }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span
                className="flex items-center gap-2 font-semibold"
                style={{ color: row.color }}
              >
                <span
                  className="size-3 rounded-full"
                  style={{ background: row.color }}
                />
                {row.label}
              </span>
              <span className="mono text-xs text-[var(--color-text-dim)]">
                {total ? Math.round((row.nodes / total) * 100) : 0}%{" "}
                {t("st.share")}
              </span>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <Cell label={t("st.held")} value={fmt(row.nodes)} />
              <Cell label={t("st.cities")} value={fmt(row.cities)} />
              <Cell
                label={t(CRYSTAL_SHORT_KEY.amethyst)}
                value={t("unit.perHour", { v: fmt(row.amethyst) })}
                dot={CRYSTAL_COLOR.amethyst}
              />
              <Cell
                label={t(CRYSTAL_SHORT_KEY.sapphire)}
                value={t("unit.perHour", { v: fmt(row.sapphire) })}
                dot={CRYSTAL_COLOR.sapphire}
              />
            </div>

            <p className="label">{t("st.buffs")}</p>
            <div className="grid grid-cols-3 gap-2">
              <Cell label={t("buff.atk.short")} value={pct(row.atk)} />
              <Cell label={t("buff.def.short")} value={pct(row.def)} />
              <Cell label={t("buff.hp.short")} value={pct(row.hp)} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Cell label={t("st.totalMap")} value={fmt(total)} />
        <Cell label={t("st.neutral")} value={fmt(neutral.nodes)} />
        <Cell
          label={`${t("st.neutral")} · ${t(CRYSTAL_SHORT_KEY.amethyst)}`}
          value={t("unit.perHour", { v: fmt(neutral.amethyst) })}
          dot={CRYSTAL_COLOR.amethyst}
        />
        <Cell
          label={`${t("st.neutral")} · ${t(CRYSTAL_SHORT_KEY.sapphire)}`}
          value={t("unit.perHour", { v: fmt(neutral.sapphire) })}
          dot={CRYSTAL_COLOR.sapphire}
        />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  dot,
}: {
  label: string;
  value: string;
  dot?: string;
}) {
  return (
    <div className="rounded-lg border bg-[var(--color-base)] px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
        {dot && (
          <span
            className="size-2 rounded-full"
            style={{ background: dot }}
            aria-hidden
          />
        )}
        {label}
      </span>
      <span className="mono text-sm font-semibold">{value}</span>
    </div>
  );
}
