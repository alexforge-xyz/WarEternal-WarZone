"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { saveNode, type ActionState } from "@/app/actions/nodes";
import { NODE_KINDS, type NodeKind, type NodeRow } from "@/db/schema";
import {
  BUFF_KEY,
  CRYSTAL_KEY,
  KIND_KEY,
  KIND_SHORT_KEY,
} from "@/lib/constants";
import {
  CRYSTAL_COLOR,
  derivedYield,
  hasMines,
  type Yield,
} from "@/lib/crystals";
import { kindForLevel, matchesRule } from "@/lib/map-rules";
import { useT } from "./i18n-provider";
import { KindIcon } from "./kind-icon";
import { useKingdoms } from "./kingdoms-provider";

const EMPTY: ActionState = { ok: false };

export function NodeForm({
  editing,
  onDone,
}: {
  editing: NodeRow | null;
  onDone: () => void;
}) {
  const { t, n: fmt } = useT();
  const { list: kingdomList, labelOf } = useKingdoms();
  const [state, formAction, pending] = useActionState(saveNode, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Kind, kingdom and level are controlled: form.reset() after a save keeps
  // them (objects come in runs of the same type and level), and the derived
  // crystal yield needs them live.
  const [kind, setKind] = useState<NodeKind>("city");
  const [kingdom, setKingdom] = useState("");
  const [level, setLevel] = useState("1");
  // null = use the derived value; a string = officer typed an override.
  const [amOverride, setAmOverride] = useState<string | null>(null);
  const [sapOverride, setSapOverride] = useState<string | null>(null);
  // On a phone the form is tall; collapsing it puts the list within reach.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!editing) return;
    setKind(editing.kind);
    setKingdom(editing.kingdom?.toString() ?? "");
    setLevel(String(editing.level));
    setAmOverride(editing.amethystOverride?.toString() ?? null);
    setSapOverride(editing.sapphireOverride?.toString() ?? null);
    setOpen(true);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (!state.ok) return;

    if (editing) {
      onDone();
    } else {
      formRef.current?.reset();
      setAmOverride(null);
      setSapOverride(null);
      nameRef.current?.focus();
    }
  }, [state, editing, onDone]);

  /**
   * The map is fixed, so the level implies the type. Typing a level snaps the
   * type to the rule; clicking a type button still wins, which is how kingdom
   * bases (outside the 1–8 scale) get entered.
   */
  function changeLevel(value: string) {
    setLevel(value);
    const ruled = kindForLevel(Number(value));
    if (ruled) setKind(ruled);
  }

  const levelNum = Number(level) || 1;
  const derived = derivedYield(kind, levelNum);
  const mines = hasMines(kind);
  const unknownLevel =
    mines && (derived.amethyst === null || derived.sapphire === null);

  return (
    <div
      ref={rootRef}
      className="scroll-mt-16 rounded-xl border bg-[var(--color-panel)]"
    >
      <div className="flex items-center justify-between gap-2 p-3 sm:p-4 sm:pb-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-start text-sm font-semibold lg:pointer-events-none"
        >
          <ChevronDown
            size={15}
            className={`shrink-0 transition-transform lg:hidden ${open ? "" : "-rotate-90 rtl:rotate-90"}`}
          />
          <span className="truncate">
            {editing ? t("form.editing", { name: editing.name }) : t("form.new")}
          </span>
        </button>
        {editing && (
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

      <form
        key={editing?.id ?? "new"}
        ref={formRef}
        action={formAction}
        className={`p-3 pt-3 sm:p-4 ${open ? "" : "hidden lg:block"}`}
      >
        {editing && <input type="hidden" name="id" value={editing.id} />}

        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="name">
              {t("form.name")}
            </label>
            <input
              id="name"
              name="name"
              ref={nameRef}
              className="field"
              defaultValue={editing?.name ?? ""}
              placeholder="Blood Crown City"
              autoComplete="off"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label" htmlFor="x">
                X
              </label>
              <input
                id="x"
                name="x"
                className="field mono"
                type="number"
                inputMode="numeric"
                defaultValue={editing?.x ?? ""}
                placeholder="512"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="y">
                Y
              </label>
              <input
                id="y"
                name="y"
                className="field mono"
                type="number"
                inputMode="numeric"
                defaultValue={editing?.y ?? ""}
                placeholder="388"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="level">
                {t("form.level")}
              </label>
              <input
                id="level"
                name="level"
                className="field mono"
                type="number"
                inputMode="numeric"
                min={1}
                value={level}
                onChange={(e) => changeLevel(e.target.value)}
              />
            </div>
          </div>

          <p className="-mt-1 text-[11px] text-[var(--color-text-dim)]">
            {t("form.levelHint")}
          </p>

          <div>
            <span className="label">
              {t("form.type")}{" "}
              <span
                className={`normal-case tracking-normal ${
                  matchesRule(kind, levelNum)
                    ? ""
                    : "text-[var(--color-accent)]"
                }`}
              >
                (
                {matchesRule(kind, levelNum)
                  ? t("form.typeAuto")
                  : t("form.typeManual")}
                )
              </span>
            </span>
            <div className="grid grid-cols-5 gap-1">
              {NODE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  title={t(KIND_KEY[k])}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-[10px] leading-tight transition-colors ${
                    kind === k
                      ? "border-[var(--color-accent)] bg-[var(--color-panel-2)]"
                      : "text-[var(--color-text-soft)] hover:border-[var(--color-text-dim)]"
                  }`}
                >
                  <KindIcon kind={k} size={18} />
                  <span className="w-full truncate text-center">
                    {t(KIND_SHORT_KEY[k])}
                  </span>
                </button>
              ))}
            </div>
            <input type="hidden" name="kind" value={kind} />
          </div>

          <div>
            <label className="label" htmlFor="kingdom">
              {t("form.kingdom")}{" "}
              {kind === "base" ? (
                <span className="text-[var(--color-accent)]">
                  {t("form.required")}
                </span>
              ) : (
                <span className="normal-case tracking-normal">
                  {t("form.optional")}
                </span>
              )}
            </label>
            <select
              id="kingdom"
              name="kingdom"
              className="field"
              value={kingdom}
              onChange={(e) => setKingdom(e.target.value)}
              required={kind === "base"}
            >
              <option value="">{t("form.none")}</option>
              {kingdomList.map((k) => (
                <option key={k.id} value={k.id}>
                  {labelOf(k.id)}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="rounded-lg border p-3">
            <legend className="px-1 text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {t("form.buffs")}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["buffAtk", editing?.buffAtk],
                  ["buffDef", editing?.buffDef],
                  ["buffHp", editing?.buffHp],
                ] as const
              ).map(([field, value]) => (
                <div key={field}>
                  <label className="label" htmlFor={field}>
                    {t(BUFF_KEY[field])}
                  </label>
                  <input
                    id={field}
                    name={field}
                    className="field mono"
                    type="text"
                    inputMode="decimal"
                    defaultValue={value ?? ""}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-lg border p-3">
            <legend className="px-1 text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {t("form.crystals")}
            </legend>
            <div className="space-y-2">
              <CrystalRow
                name="amethystOverride"
                labelKey={CRYSTAL_KEY.amethyst}
                color={CRYSTAL_COLOR.amethyst}
                derived={derived.amethyst}
                mines={mines}
                override={amOverride}
                setOverride={setAmOverride}
              />
              <CrystalRow
                name="sapphireOverride"
                labelKey={CRYSTAL_KEY.sapphire}
                color={CRYSTAL_COLOR.sapphire}
                derived={derived.sapphire}
                mines={mines}
                override={sapOverride}
                setOverride={setSapOverride}
              />
            </div>
            {unknownLevel && (
              <p className="mt-2 text-[11px] text-[var(--color-danger)]">
                {t("crystal.unknown", { n: fmt(levelNum) })}
              </p>
            )}
          </fieldset>

          <div>
            <label className="label" htmlFor="notes">
              {t("form.note")}
            </label>
            <input
              id="notes"
              name="notes"
              className="field"
              defaultValue={editing?.notes ?? ""}
              placeholder={t("form.notePlaceholder")}
              autoComplete="off"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary mt-4 min-h-11 w-full"
        >
          {editing ? <Check size={15} /> : <Plus size={15} />}
          {pending ? t("form.saving") : editing ? t("form.save") : t("form.add")}
        </button>

        {state.error && (
          <p className="mt-2 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            {t(state.error, state.params)}
          </p>
        )}
        {state.ok && state.message && (
          <p className="mt-2 text-xs text-[var(--color-ok)]">
            {t(state.message, state.params)}
          </p>
        )}
      </form>
    </div>
  );
}

/**
 * Yield is derived from kind + level, so the normal case is read-only.
 * The override input only appears when the officer asks for it.
 */
function CrystalRow({
  name,
  labelKey,
  color,
  derived,
  mines,
  override,
  setOverride,
}: {
  name: string;
  labelKey: Parameters<ReturnType<typeof useT>["t"]>[0];
  color: string;
  derived: Yield["amethyst"];
  mines: boolean;
  override: string | null;
  setOverride: (v: string | null) => void;
}) {
  const { t, n: fmt } = useT();
  const manual = override !== null;

  return (
    <div className="flex items-center gap-2">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className="w-24 shrink-0 truncate text-xs">{t(labelKey)}</span>

      {manual ? (
        <input
          name={name}
          className="field mono !w-24 !py-1"
          type="number"
          inputMode="numeric"
          min={0}
          value={override}
          onChange={(e) => setOverride(e.target.value)}
          autoFocus
        />
      ) : (
        <>
          <input type="hidden" name={name} value="" />
          <span className="mono flex-1 text-xs">
            {!mines ? (
              <span className="text-[var(--color-text-dim)]">
                {t("crystal.noMines")}
              </span>
            ) : derived === null ? (
              <span className="text-[var(--color-danger)]">?</span>
            ) : (
              t("unit.perHour", { v: fmt(derived) })
            )}
          </span>
        </>
      )}

      <button
        type="button"
        onClick={() => setOverride(manual ? null : String(derived ?? 0))}
        className="btn btn-ghost ms-auto shrink-0 !px-2 !py-1 text-[11px]"
      >
        {manual ? t("crystal.useAuto") : t("crystal.override")}
      </button>
    </div>
  );
}
