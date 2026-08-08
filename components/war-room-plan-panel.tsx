"use client";

import { useTransition } from "react";
import { Eraser, ShieldHalf } from "lucide-react";
import {
  clearPlan,
  setBypassShields,
  setPlanningKingdom,
} from "@/app/actions/plan";
import type { PlanSnapshot } from "@/lib/plan-types";
import type { PlanStats } from "@/lib/plan-stats";
import { CRYSTAL_COLOR } from "@/lib/crystals";
import { BuffIcon } from "./buff-icon";
import { useT } from "./i18n-provider";
import { useKingdoms } from "./kingdoms-provider";
import { useRole } from "./role-provider";

/**
 * One tight strip over the war-room map: what the plan costs / yields.
 * No trail list — trails live on the board; long-press removes nodes.
 */
export function WarRoomPlanPanel({
  plan,
  stats,
  onPlan,
  error,
}: {
  plan: PlanSnapshot;
  stats: PlanStats;
  onPlan: (plan: PlanSnapshot) => void;
  error: string | null;
}) {
  const { t, n } = useT();
  // Always "K6" / custom nick — not translated "Kingdom 6".
  const { list, shortOf } = useKingdoms();
  const { canEdit, canPlan } = useRole();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; plan?: PlanSnapshot }>) {
    start(() => {
      void (async () => {
        const res = await fn();
        if (res.ok && res.plan) onPlan(res.plan);
      })();
    });
  }

  const fmt = (v: number | null) => (v === null ? "?" : n(v));
  const hasPlan = plan.paths.length > 0;

  return (
    <div className="shrink-0 border-b px-2 py-1">
      <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-tight">
        {canEdit && list.length > 0 ? (
          <select
            className="field !min-h-7 !w-auto !max-w-[7.5rem] !py-0.5 !pe-6 !text-[11px]"
            value={plan.planningKingdomId ?? ""}
            disabled={pending}
            title={t("plan.kingdom")}
            aria-label={t("plan.kingdom")}
            onChange={(e) => {
              const id = Number(e.target.value);
              if (!Number.isInteger(id)) return;
              run(() => setPlanningKingdom(id));
            }}
          >
            {list.map((k) => (
              <option key={k.id} value={k.id}>
                {shortOf(k.id)}
              </option>
            ))}
          </select>
        ) : plan.planningKingdomId != null ? (
          <span className="text-[var(--color-text-dim)]">
            {shortOf(plan.planningKingdomId)}
          </span>
        ) : null}

        {/*
          Reads as a state, not a verb: "щиты: обход — активно". A button
          labelled "bypass shields" leaves you guessing whether you are looking
          at what it does or at what it is currently doing, and this one
          silently changes what every trail drawn afterwards means.
        */}
        {canPlan ? (
          <button
            type="button"
            disabled={pending}
            aria-pressed={plan.bypassShields}
            title={t("plan.bypassHint")}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-tight transition-colors ${
              plan.bypassShields
                ? "border-[var(--color-warn)] text-[var(--color-warn)]"
                : "border-[var(--color-line)] text-[var(--color-text-dim)]"
            }`}
            onClick={() => run(() => setBypassShields(!plan.bypassShields))}
          >
            <ShieldHalf size={11} />
            <span>{t("plan.bypass")}</span>
            <span className="font-semibold">
              {plan.bypassShields ? t("plan.bypassOn") : t("plan.bypassOff")}
            </span>
          </button>
        ) : plan.bypassShields ? (
          // Guests and helpers still need to know which question the plan on
          // screen is answering.
          <span
            className="inline-flex items-center gap-1 text-[10px] text-[var(--color-warn)]"
            title={t("plan.bypassHint")}
          >
            <ShieldHalf size={11} />
            {t("plan.bypass")} {t("plan.bypassOn")}
          </span>
        ) : null}

        <span className="text-[var(--color-line)]" aria-hidden>
          ·
        </span>
        <span
          className="font-medium tabular-nums text-[var(--color-text)]"
          title={
            stats.hornsProvisional ? t("plan.hornsHint") : t("plan.horns")
          }
        >
          {t("plan.horns")}: {fmt(stats.horns)}
        </span>
        <span className="text-[var(--color-line)]" aria-hidden>
          ·
        </span>
        <span
          className="tabular-nums font-medium"
          style={{ color: CRYSTAL_COLOR.amethyst }}
          title={t("plan.amethyst")}
        >
          {fmt(stats.amethystPerHour)}
          <span className="ms-0.5 font-normal opacity-80">
            {t("crystal.amethyst.short")}
          </span>
        </span>
        <span
          className="tabular-nums font-medium"
          style={{ color: CRYSTAL_COLOR.sapphire }}
          title={t("plan.sapphire")}
        >
          {fmt(stats.sapphirePerHour)}
          <span className="ms-0.5 font-normal opacity-80">
            {t("crystal.sapphire.short")}
          </span>
        </span>
        <span className="text-[var(--color-line)]" aria-hidden>
          ·
        </span>
        {/* Same lucide glyphs as map buff mode (Swords / ShieldHalf / Heart). */}
        <span
          className="inline-flex items-center gap-0.5 tabular-nums font-medium"
          title={t("plan.buffAtk")}
        >
          <BuffIcon field="buffAtk" size={12} />
          <span>+{n(stats.buffAtk)}%</span>
        </span>
        <span
          className="inline-flex items-center gap-0.5 tabular-nums font-medium"
          title={t("plan.buffDef")}
        >
          <BuffIcon field="buffDef" size={12} />
          <span>+{n(stats.buffDef)}%</span>
        </span>
        <span
          className="inline-flex items-center gap-0.5 tabular-nums font-medium"
          title={t("plan.buffHp")}
        >
          <BuffIcon field="buffHp" size={12} />
          <span>+{n(stats.buffHp)}%</span>
        </span>
        {hasPlan ? (
          <>
            <span className="text-[var(--color-line)]" aria-hidden>
              ·
            </span>
            <span className="tabular-nums text-[var(--color-text-dim)]">
              {n(stats.captureCount)}
            </span>
            <button
              type="button"
              className="ms-auto flex size-7 items-center justify-center rounded-md text-[var(--color-text-dim)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-danger)]"
              disabled={pending}
              title={t("plan.clear")}
              aria-label={t("plan.clear")}
              onClick={() => run(() => clearPlan())}
            >
              <Eraser size={14} />
            </button>
          </>
        ) : (
          <span className="ms-auto text-[var(--color-text-dim)]">
            {t("plan.emptyShort")}
          </span>
        )}
      </div>

      {/*
        Wraps rather than truncates. These messages name the thing standing in
        the way — "on the «Worldbreaker Battlefield» gate" — and on a phone
        `truncate` ate the end of exactly the sentence worth reading. Two lines
        of 10px, and only while an error is up.
      */}
      {error ? (
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
