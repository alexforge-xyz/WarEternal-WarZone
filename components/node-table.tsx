"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Search, Trash2, Unlink } from "lucide-react";
import { deleteNode } from "@/app/actions/nodes";
import { NODE_KINDS, type NodeKind, type NodeRow } from "@/db/schema";
import {
  BUFF_SHORT_KEY,
  CRYSTAL_SHORT_KEY,
  KIND_KEY,
  KIND_SHORT_KEY,
  pct,
} from "@/lib/constants";
import { CRYSTAL_COLOR, effectiveYield } from "@/lib/crystals";
import { useT } from "./i18n-provider";
import { KindIcon } from "./kind-icon";
import { useKingdoms } from "./kingdoms-provider";
import { useRole } from "./role-provider";

export function NodeTable({
  nodes,
  linkCounts,
  editingId,
  onEdit,
}: {
  nodes: NodeRow[];
  linkCounts: Record<number, number>;
  editingId: number | null;
  onEdit: (node: NodeRow) => void;
}) {
  const { t, n: fmt } = useT();
  // Editing the map is admin-only. The server enforces it; hiding the buttons
  // keeps officers from reaching for something that will only be refused.
  const { canEdit } = useRole();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<NodeKind | "all">("all");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [pending, startTransition] = useTransition();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((node) => {
      if (kindFilter !== "all" && node.kind !== kindFilter) return false;
      if (onlyUnlinked && (linkCounts[node.id] ?? 0) > 0) return false;
      if (!q) return true;
      return (
        node.name.toLowerCase().includes(q) ||
        `${node.x}:${node.y}`.includes(q) ||
        (node.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [nodes, query, kindFilter, onlyUnlinked, linkCounts]);

  function remove(node: NodeRow) {
    const links = linkCounts[node.id] ?? 0;
    const text = [
      t("table.confirmDelete", { name: node.name, x: node.x, y: node.y }),
      links ? t("table.confirmDeleteLinks", { n: links }) : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!confirm(text)) return;
    startTransition(() => {
      void deleteNode(node.id);
    });
  }

  /** Derived yield, or "?" when the level is outside the known table. */
  function Yield({ value, manual }: { value: number | null; manual: boolean }) {
    if (value === null)
      return <span className="text-[var(--color-danger)]">?</span>;
    if (!value) return <>—</>;
    return (
      <span title={manual ? t("crystal.override") : t("crystal.auto")}>
        {t("unit.perHour", { v: fmt(value) })}
        {manual && <span className="text-[var(--color-accent)]">*</span>}
      </span>
    );
  }

  return (
    <div className="rounded-xl border bg-[var(--color-panel)]">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-44 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]"
          />
          <input
            className="field !ps-8"
            placeholder={t("table.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <select
          className="field !w-auto"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as NodeKind | "all")}
        >
          <option value="all">{t("table.allTypes")}</option>
          {NODE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(KIND_KEY[k])}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setOnlyUnlinked((v) => !v)}
          title={t("table.unlinkedHint")}
          className={`btn min-h-10 text-xs ${
            onlyUnlinked ? "border-[var(--color-accent)]" : ""
          }`}
        >
          <Unlink size={13} />
          {t("table.unlinked")}
        </button>
      </div>

      {/* ---- phone: cards ---- */}
      <ul className="divide-y md:hidden">
        {rows.map((node) => {
          const y = effectiveYield(node);
          return (
          <li
            key={node.id}
            className={`p-3 ${editingId === node.id ? "bg-[var(--color-panel-2)]" : ""}`}
          >
            <div className="flex items-start gap-2">
              <KindIcon kind={node.kind} size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{node.name}</span>
                  {node.kingdom && <KingdomBadge kingdom={node.kingdom} />}
                  <span className="mono text-xs text-[var(--color-text-dim)]">
                    {node.x}:{node.y}
                  </span>
                  <span className="mono rounded bg-[var(--color-panel-2)] px-1.5 text-xs">
                    {t("table.level")} {node.level}
                  </span>
                  <LinkBadge count={linkCounts[node.id] ?? 0} label={t("table.links")} />
                </div>

                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-text-soft)]">
                  <span>{t(KIND_SHORT_KEY[node.kind])}</span>
                  {node.buffAtk > 0 && (
                    <span>
                      {t(BUFF_SHORT_KEY.buffAtk)} {pct(node.buffAtk)}
                    </span>
                  )}
                  {node.buffDef > 0 && (
                    <span>
                      {t(BUFF_SHORT_KEY.buffDef)} {pct(node.buffDef)}
                    </span>
                  )}
                  {node.buffHp > 0 && (
                    <span>
                      {t(BUFF_SHORT_KEY.buffHp)} {pct(node.buffHp)}
                    </span>
                  )}
                  {y.amethyst !== 0 && (
                    <span className="flex items-center gap-1">
                      <Dot color={CRYSTAL_COLOR.amethyst} />
                      {t(CRYSTAL_SHORT_KEY.amethyst)}{" "}
                      <Yield
                        value={y.amethyst}
                        manual={node.amethystOverride !== null}
                      />
                    </span>
                  )}
                  {y.sapphire !== 0 && (
                    <span className="flex items-center gap-1">
                      <Dot color={CRYSTAL_COLOR.sapphire} />
                      {t(CRYSTAL_SHORT_KEY.sapphire)}{" "}
                      <Yield
                        value={y.sapphire}
                        manual={node.sapphireOverride !== null}
                      />
                    </span>
                  )}
                </p>

                {node.notes && (
                  <p className="mt-1 text-xs text-[var(--color-text-dim)]">
                    {node.notes}
                  </p>
                )}
              </div>

              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(node)}
                    title={t("table.edit")}
                    className="btn btn-ghost !min-h-10 !min-w-10 !px-0"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(node)}
                    disabled={pending}
                    title={t("table.delete")}
                    className="btn btn-ghost !min-h-10 !min-w-10 !px-0 hover:!border-[var(--color-danger)]"
                  >
                    <Trash2 size={15} className="text-[var(--color-danger)]" />
                  </button>
                </div>
              )}
            </div>
          </li>
          );
        })}
      </ul>

      {/* ---- tablet and up: table ---- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
              <Th>{t("table.type")}</Th>
              <Th>{t("table.name")}</Th>
              <Th>{t("table.coords")}</Th>
              <Th>{t("table.level")}</Th>
              <Th>{t(BUFF_SHORT_KEY.buffAtk)}</Th>
              <Th>{t(BUFF_SHORT_KEY.buffDef)}</Th>
              <Th>{t(BUFF_SHORT_KEY.buffHp)}</Th>
              <Th>
                <Dot color={CRYSTAL_COLOR.amethyst} />{" "}
                {t(CRYSTAL_SHORT_KEY.amethyst)}
              </Th>
              <Th>
                <Dot color={CRYSTAL_COLOR.sapphire} />{" "}
                {t(CRYSTAL_SHORT_KEY.sapphire)}
              </Th>
              <Th center>{t("table.links")}</Th>
              {canEdit && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((node) => {
              const y = effectiveYield(node);
              return (
              <tr
                key={node.id}
                className={`border-b border-[var(--color-line)]/50 transition-colors last:border-0 hover:bg-[var(--color-panel-2)]/60 ${
                  editingId === node.id ? "bg-[var(--color-panel-2)]" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <span
                    className="flex items-center gap-1.5 whitespace-nowrap text-xs"
                    title={t(KIND_KEY[node.kind])}
                  >
                    <KindIcon kind={node.kind} size={15} />
                    {t(KIND_SHORT_KEY[node.kind])}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    {node.name}
                    {node.kingdom && <KingdomBadge kingdom={node.kingdom} />}
                  </span>
                  {node.notes && (
                    <span className="block text-xs text-[var(--color-text-dim)]">
                      {node.notes}
                    </span>
                  )}
                </td>
                <td className="mono whitespace-nowrap px-3 py-2 text-xs text-[var(--color-text-soft)]">
                  {node.x}:{node.y}
                </td>
                <td className="mono px-3 py-2 text-xs">{node.level}</td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-soft)]">
                  {pct(node.buffAtk)}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-soft)]">
                  {pct(node.buffDef)}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-text-soft)]">
                  {pct(node.buffHp)}
                </td>
                <td className="mono whitespace-nowrap px-3 py-2 text-xs text-[var(--color-text-soft)]">
                  <Yield
                    value={y.amethyst}
                    manual={node.amethystOverride !== null}
                  />
                </td>
                <td className="mono whitespace-nowrap px-3 py-2 text-xs text-[var(--color-text-soft)]">
                  <Yield
                    value={y.sapphire}
                    manual={node.sapphireOverride !== null}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <LinkBadge count={linkCounts[node.id] ?? 0} />
                </td>
                {canEdit && (
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(node)}
                        title={t("table.edit")}
                        className="btn btn-ghost !px-1.5 !py-1"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(node)}
                        disabled={pending}
                        title={t("table.delete")}
                        className="btn btn-ghost !px-1.5 !py-1 hover:!border-[var(--color-danger)]"
                      >
                        <Trash2
                          size={13}
                          className="text-[var(--color-danger)]"
                        />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="px-3 py-10 text-center text-sm text-[var(--color-text-dim)]">
          {nodes.length === 0 ? t("table.empty") : t("table.notFound")}
        </p>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2 rounded-full align-middle"
      style={{ background: color }}
      aria-hidden
    />
  );
}

function Th({
  children,
  center,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <th
      className={`px-3 py-2 font-medium ${center ? "text-center" : "text-start"}`}
    >
      {children}
    </th>
  );
}

function KingdomBadge({ kingdom }: { kingdom: number }) {
  const { colorOf, shortOf, labelOf } = useKingdoms();
  const color = colorOf(kingdom);
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color, background: `${color}1f` }}
      title={labelOf(kingdom)}
    >
      {shortOf(kingdom)}
    </span>
  );
}

function LinkBadge({ count, label }: { count: number; label?: string }) {
  return (
    <span
      className={`mono inline-block min-w-5 rounded px-1 text-center text-xs ${
        count === 0
          ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)]"
          : "text-[var(--color-text-dim)]"
      }`}
    >
      {label ? `${label} ${count}` : count}
    </span>
  );
}
