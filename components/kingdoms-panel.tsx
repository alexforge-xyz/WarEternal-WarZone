"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { deleteKingdom, saveKingdom } from "@/app/actions/kingdoms";
import type { ActionState } from "@/app/actions/nodes";
import type { NodeRow } from "@/db/schema";
import { KINGDOM_PALETTE } from "@/lib/constants";
import { useT } from "./i18n-provider";
import { useKingdoms, type KingdomInfo } from "./kingdoms-provider";

const EMPTY: ActionState = { ok: false };

/** Just what a card needs off a base node. */
type Base = { id: number; name: string; x: number; y: number };

/**
 * Who is on the board this event. Admin-only: the kingdom colour is how every
 * officer reads the map at a glance, so it is static-map data like the nodes
 * themselves, not something to change while a fight is on.
 */
export function KingdomsPanel({ nodes }: { nodes: NodeRow[] }) {
  const { t } = useT();
  const { list } = useKingdoms();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const bases: Base[] = nodes
    .filter((n) => n.kind === "base")
    .map(({ id, name, x, y }) => ({ id, name, x, y }));

  const held: Record<number, number> = {};
  const baseOf: Record<number, number> = {};
  for (const node of nodes) {
    if (node.owner) held[node.owner] = (held[node.owner] ?? 0) + 1;
    if (node.kingdom && node.kind === "base") baseOf[node.kingdom] = node.id;
  }

  return (
    <div className="mb-3 rounded-xl border bg-[var(--color-panel)] sm:mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-start text-sm font-semibold sm:px-4"
      >
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform ${open ? "" : "-rotate-90 rtl:rotate-90"}`}
        />
        <span>{t("kd.title")}</span>
        <span className="ms-1 flex gap-1">
          {list.map((k) => (
            <span
              key={k.id}
              className="size-2.5 rounded-full"
              style={{ background: k.color }}
              aria-hidden
            />
          ))}
        </span>
      </button>

      {open && (
        <div className="border-t p-3 sm:p-4">
          <p className="mb-3 text-[11px] text-[var(--color-text-dim)]">
            {t("kd.hint")}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((k) => (
              <KingdomCard
                key={k.id}
                kingdom={k}
                bases={bases}
                baseId={baseOf[k.id] ?? null}
                held={held[k.id] ?? 0}
                deletable={list.length > 1}
              />
            ))}

            {adding && (
              <KingdomCard
                kingdom={null}
                bases={bases}
                baseId={null}
                held={0}
                deletable={false}
                onDone={() => setAdding(false)}
              />
            )}
          </div>

          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="btn mt-3 min-h-11 w-full text-xs"
            >
              <Plus size={14} />
              {t("kd.add")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function KingdomCard({
  kingdom,
  bases,
  baseId,
  held,
  deletable,
  onDone,
}: {
  kingdom: KingdomInfo | null;
  bases: Base[];
  baseId: number | null;
  held: number;
  deletable: boolean;
  onDone?: () => void;
}) {
  const { t, n: fmt } = useT();
  const [state, formAction, pending] = useActionState(saveKingdom, EMPTY);
  const [removing, startRemoving] = useTransition();

  // Colour is a swatch grid rather than a text field, so it is controlled and
  // travels in a hidden input.
  const [color, setColor] = useState(kingdom?.color ?? KINGDOM_PALETTE[0]);

  useEffect(() => {
    if (kingdom) setColor(kingdom.color);
  }, [kingdom]);

  // A freshly added kingdom leaves the "new" card and joins the list above.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state.ok && !kingdom) onDone?.();
  }, [state, kingdom, onDone]);

  const label = kingdom
    ? kingdom.name?.trim() || t("kingdom.n", { n: kingdom.number })
    : t("kd.adding");

  function remove() {
    if (!kingdom) return;
    if (!confirm(t("kd.confirmDelete", { name: label, n: held }))) return;
    startRemoving(() => {
      void deleteKingdom(kingdom.id);
    });
  }

  return (
    <form
      action={formAction}
      className="rounded-lg border p-3"
      style={{ borderColor: `${color}55` }}
    >
      {kingdom && <input type="hidden" name="id" value={kingdom.id} />}
      <input type="hidden" name="color" value={color} />

      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className="flex min-w-0 items-center gap-2 text-sm font-semibold"
          style={{ color }}
        >
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ background: color }}
            aria-hidden
          />
          <span className="truncate">{label}</span>
        </span>
        {kingdom ? (
          <span className="mono shrink-0 text-[11px] text-[var(--color-text-dim)]">
            {t("kd.held", { n: fmt(held) })}
          </span>
        ) : (
          <button
            type="button"
            onClick={onDone}
            className="btn btn-ghost shrink-0 !px-2 !py-1 text-xs"
          >
            <X size={13} />
            {t("form.cancel")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <div>
          <label className="label" htmlFor={`kn-${kingdom?.id ?? "new"}`}>
            {t("kd.number")}
          </label>
          <input
            id={`kn-${kingdom?.id ?? "new"}`}
            name="number"
            className="field mono"
            type="number"
            inputMode="numeric"
            min={1}
            defaultValue={kingdom?.number ?? ""}
            placeholder="6"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor={`kname-${kingdom?.id ?? "new"}`}>
            {t("kd.name")}
          </label>
          <input
            id={`kname-${kingdom?.id ?? "new"}`}
            name="name"
            className="field"
            defaultValue={kingdom?.name ?? ""}
            placeholder={t("kd.namePlaceholder")}
            maxLength={32}
            autoComplete="off"
          />
        </div>
      </div>

      <span className="label mt-2 block">{t("kd.color")}</span>
      <div className="flex flex-wrap gap-1.5">
        {KINGDOM_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={c}
            aria-pressed={color === c}
            className={`size-8 rounded-lg border-2 transition-transform ${
              color === c ? "scale-110" : "border-transparent"
            }`}
            style={{
              background: c,
              borderColor: color === c ? "var(--color-text)" : undefined,
            }}
          />
        ))}
      </div>

      <div className="mt-2">
        <label className="label" htmlFor={`kb-${kingdom?.id ?? "new"}`}>
          {t("kd.base")}
        </label>
        <select
          id={`kb-${kingdom?.id ?? "new"}`}
          name="baseId"
          className="field"
          defaultValue={baseId ?? ""}
        >
          <option value="">{t("kd.noBase")}</option>
          {bases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {b.x}:{b.y}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
          {t("kd.baseHint")}
        </p>
      </div>

      <div className="mt-3 flex gap-1.5">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary min-h-11 flex-1 text-xs"
        >
          <Check size={14} />
          {pending ? t("form.saving") : t("form.save")}
        </button>
        {kingdom && deletable && (
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            title={t("table.delete")}
            className="btn !min-h-11 !min-w-11 !px-0 hover:!border-[var(--color-danger)]"
          >
            <Trash2 size={15} className="text-[var(--color-danger)]" />
          </button>
        )}
      </div>

      {state.error && (
        <p className="mt-2 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-2.5 py-1.5 text-xs text-[var(--color-danger)]">
          {t(state.error, state.params)}
        </p>
      )}
      {state.ok && state.message && (
        <p className="mt-2 text-xs text-[var(--color-ok)]">
          {t(state.message, state.params)}
        </p>
      )}
    </form>
  );
}
