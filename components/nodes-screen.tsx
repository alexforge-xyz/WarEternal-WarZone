"use client";

import { useCallback, useMemo, useState } from "react";
import { NODE_KINDS, type NodeRow } from "@/db/schema";
import { CRYSTAL_SHORT_KEY, KIND_SHORT_KEY } from "@/lib/constants";
import { CRYSTAL_COLOR, effectiveYield } from "@/lib/crystals";
import { useT } from "./i18n-provider";
import { KindIcon } from "./kind-icon";
import { KingdomsPanel } from "./kingdoms-panel";
import { NodeForm } from "./node-form";
import { NodeTable } from "./node-table";
import { useRole } from "./role-provider";

export function NodesScreen({
  nodes,
  linkCounts,
}: {
  nodes: NodeRow[];
  linkCounts: Record<number, number>;
}) {
  const { t, n: fmt } = useT();
  const { canEdit } = useRole();
  const [editing, setEditing] = useState<NodeRow | null>(null);

  // The server rerenders after every save; keep the edited row in sync so the
  // form shows the stored values rather than a stale snapshot.
  const editingLive = useMemo(
    () => (editing ? (nodes.find((n) => n.id === editing.id) ?? null) : null),
    [editing, nodes],
  );

  const clearEditing = useCallback(() => setEditing(null), []);

  const totals = useMemo(() => {
    const byKind = Object.fromEntries(NODE_KINDS.map((k) => [k, 0])) as Record<
      (typeof NODE_KINDS)[number],
      number
    >;
    let amethyst = 0;
    let sapphire = 0;
    let unlinked = 0;
    // Nodes whose level is outside the yield table would silently understate
    // the totals, so they are counted and surfaced instead.
    let unknownYield = 0;
    for (const node of nodes) {
      byKind[node.kind] += 1;
      const y = effectiveYield(node);
      if (y.amethyst === null || y.sapphire === null) unknownYield += 1;
      amethyst += y.amethyst ?? 0;
      sapphire += y.sapphire ?? 0;
      if ((linkCounts[node.id] ?? 0) === 0) unlinked += 1;
    }
    return { byKind, amethyst, sapphire, unlinked, unknownYield };
  }, [nodes, linkCounts]);

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4 sm:py-5">
      <div className="mb-4 flex flex-wrap gap-1.5 sm:gap-2">
        <Stat label={t("stats.nodes")} value={fmt(nodes.length)} />
        {NODE_KINDS.map((k) => (
          <Stat
            key={k}
            label={t(KIND_SHORT_KEY[k])}
            value={fmt(totals.byKind[k])}
            icon={<KindIcon kind={k} size={13} />}
          />
        ))}
        <Stat
          label={t("stats.totalPerHour", { c: t(CRYSTAL_SHORT_KEY.amethyst) })}
          value={fmt(totals.amethyst)}
          icon={<Dot color={CRYSTAL_COLOR.amethyst} />}
        />
        <Stat
          label={t("stats.totalPerHour", { c: t(CRYSTAL_SHORT_KEY.sapphire) })}
          value={fmt(totals.sapphire)}
          icon={<Dot color={CRYSTAL_COLOR.sapphire} />}
        />
        {totals.unlinked > 0 && (
          <Stat label={t("stats.unlinked")} value={fmt(totals.unlinked)} danger />
        )}
        {totals.unknownYield > 0 && (
          <Stat
            label={t("stats.unknownYield")}
            value={fmt(totals.unknownYield)}
            danger
          />
        )}
      </div>

      {canEdit && <KingdomsPanel nodes={nodes} />}

      <div
        className={`grid gap-3 sm:gap-4 ${
          canEdit ? "lg:grid-cols-[minmax(320px,380px)_1fr]" : ""
        }`}
      >
        {canEdit && (
          <div className="lg:sticky lg:top-[4.5rem] lg:self-start">
            <NodeForm editing={editingLive} onDone={clearEditing} />
          </div>
        )}
        <NodeTable
          nodes={nodes}
          linkCounts={linkCounts}
          editingId={editingLive?.id ?? null}
          onEdit={setEditing}
        />
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

function Stat({
  label,
  value,
  icon,
  danger,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${
        danger
          ? "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10"
          : "bg-[var(--color-panel)]"
      }`}
    >
      {icon}
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] sm:text-[11px]">
        {label}
      </span>
      <span
        className={`mono text-sm font-semibold ${
          danger ? "text-[var(--color-danger)]" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
