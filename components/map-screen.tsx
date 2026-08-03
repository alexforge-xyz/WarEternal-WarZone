"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  Check,
  Crosshair,
  List,
  RotateCcw,
  Search,
  ShieldPlus,
  Swords,
  X,
} from "lucide-react";
import {
  clearShield,
  confirmNode,
  setOwner,
  setShield,
} from "@/app/actions/ownership";
import { KIND_KEY, kingdomShort } from "@/lib/constants";
import type { EdgeRow, NodeRow } from "@/db/schema";
import {
  STALE_AFTER_HOURS,
  formatAgo,
  formatDuration,
  hasShield,
  isStale,
  shieldSecondsLeft,
} from "@/lib/staleness";
import { useT } from "./i18n-provider";
import { KindIcon } from "./kind-icon";
import { useKingdoms, type KingdomInfo } from "./kingdoms-provider";
import { MapCanvas, type MapMode, type NodeStyle } from "./map-canvas";
import { useRole } from "./role-provider";
import { useClock } from "./use-clock";

const NAME_KEY = "warzone_officer";

/** Map clock steps — panel still ticks every second for countdowns. */
const MAP_CLOCK_STEP_S = 5;

export function MapScreen({
  nodes,
  edges,
  serverNow,
}: {
  nodes: NodeRow[];
  edges: EdgeRow[];
  serverNow: number;
}) {
  const { t } = useT();
  const { canMonitor } = useRole();
  const kingdoms = useKingdoms();
  // 1s for the side panel countdowns. The map uses a stepped clock so it
  // does not rebuild ~600 SVG nodes every second on a phone.
  const now = useClock(serverNow);
  const mapNow = Math.floor(now / MAP_CLOCK_STEP_S) * MAP_CLOCK_STEP_S;

  const [rotated, setRotated] = useState(true);
  const [flipY, setFlipY] = useState(false);
  const [mode, setMode] = useState<MapMode>("kind");
  const [fitToken, setFitToken] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [onlyStale, setOnlyStale] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [who, setWho] = useState("");
  const [pending, startTransition] = useTransition();

  // Self-declared nickname; there is no auth yet, this is for the change log.
  useEffect(() => {
    setWho(localStorage.getItem(NAME_KEY) ?? "");
  }, []);
  function changeWho(v: string) {
    setWho(v);
    localStorage.setItem(NAME_KEY, v);
  }

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedNode = selected !== null ? byId.get(selected) : undefined;

  const { colorOf, list: kingdomList, shortOf } = kingdoms;

  const onSelectNode = useCallback((id: number) => setSelected(id), []);
  const onFit = useCallback(() => setFitToken((v) => v + 1), []);
  const onToggleMode = useCallback(
    () => setMode((m) => (m === "buff" ? "kind" : "buff")),
    [],
  );
  const onToggleRotated = useCallback(() => setRotated((v) => !v), []);
  const onToggleFlipY = useCallback(() => setFlipY((v) => !v), []);
  const onOpenSheet = useCallback(() => setSheetOpen(true), []);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((node) => {
      if (onlyStale && !isStale(node.checkedAt, now)) return false;
      if (!q) return true;
      return (
        node.name.toLowerCase().includes(q) || `${node.x}:${node.y}`.includes(q)
      );
    });
  }, [nodes, query, onlyStale, now]);

  // Stale count for the filter chip — fine-grained is fine here (list, not SVG).
  const staleCount = useMemo(() => {
    let n = 0;
    for (const node of nodes) if (isStale(node.checkedAt, now)) n += 1;
    return n;
  }, [nodes, now]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const panel = (
    <>
      <div className="border-b p-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]"
          />
          <input
            className="field !ps-8"
            placeholder={t("map.findNode")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyStale((v) => !v)}
          className={`btn mt-2 min-h-9 w-full text-xs ${
            onlyStale ? "border-[var(--color-warn)]" : ""
          }`}
        >
          <span className="text-[var(--color-warn)]">!</span>
          {t("map.onlyStale")} · {staleCount}
        </button>
      </div>

      {selectedNode && (
        <NodePanel
          node={selectedNode}
          now={now}
          who={who}
          pending={pending}
          readOnly={!canMonitor}
          onClose={() => setSelected(null)}
          run={(fn) => startTransition(fn)}
        />
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {listed.map((node) => {
          const stale = isStale(node.checkedAt, now);
          const left = shieldSecondsLeft(node.shieldUntil, now);
          return (
            <li key={node.id}>
              <button
                onClick={() => setSelected(node.id)}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-start text-xs transition-colors hover:bg-[var(--color-panel-2)] ${
                  selected === node.id ? "bg-[var(--color-panel-2)]" : ""
                }`}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: colorOf(node.owner) }}
                />
                <KindIcon kind={node.kind} size={14} />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                {left > 0 && (
                  <span className="mono text-[10px] text-[#7dd3fc]">
                    {formatDuration(left)}
                  </span>
                )}
                {stale && (
                  <span className="rounded bg-[var(--color-warn)]/20 px-1 text-[10px] font-bold text-[var(--color-warn)]">
                    !
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {canMonitor && (
        <div className="border-t p-3">
          <label className="label" htmlFor="who">
            {t("own.who")}{" "}
            <span className="normal-case tracking-normal">
              — {t("own.whoHint")}
            </span>
          </label>
          <input
            id="who"
            className="field"
            value={who}
            onChange={(e) => changeWho(e.target.value)}
            placeholder="[K6] ..."
            autoComplete="off"
          />
        </div>
      )}
    </>
  );

  return (
    // Explicit viewport height (header ~3.5rem + footer ~2.5rem). Never use
    // min-h-[420px] here — on short phones it grows past 100dvh and the
    // browser steals touches for page scroll instead of map pan.
    <div className="grid h-[calc(100svh-6rem)] max-h-[calc(100svh-6rem)] grid-cols-1 overflow-hidden lg:grid-cols-[1fr_340px]">
      <div className="relative min-h-0 lg:border-e">
        {/*
          Isolated from the 1s panel clock: only re-renders when mapNow (5s),
          selection, mode, or map data changes — not every shield tick.
        */}
        <OwnershipMap
          nodes={nodes}
          edges={edges}
          mapNow={mapNow}
          colorOf={colorOf}
          kingdomList={kingdomList}
          shortOf={shortOf}
          rotated={rotated}
          flipY={flipY}
          mode={mode}
          fitToken={fitToken}
          selectedId={selected}
          selectedName={selectedNode?.name ?? null}
          onSelectNode={onSelectNode}
          onFit={onFit}
          onToggleMode={onToggleMode}
          onToggleRotated={onToggleRotated}
          onToggleFlipY={onToggleFlipY}
          onOpenSheet={onOpenSheet}
        />
      </div>

      <aside className="hidden min-h-0 flex-col bg-[var(--color-panel)] lg:flex">
        {panel}
      </aside>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label={t("form.cancel")}
            className="absolute inset-0 bg-black/50"
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl border-t bg-[var(--color-panel)]">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">{t("nav.map")}</span>
              <button
                className="btn btn-ghost !min-h-10 !min-w-10 !px-0"
                onClick={() => setSheetOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{panel}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SVG map + chrome that only depends on the coarse map clock. Memoised so the
 * panel's once-per-second tick does not rebuild the whole graph.
 */
const OwnershipMap = memo(function OwnershipMap({
  nodes,
  edges,
  mapNow,
  colorOf,
  kingdomList,
  shortOf,
  rotated,
  flipY,
  mode,
  fitToken,
  selectedId,
  selectedName,
  onSelectNode,
  onFit,
  onToggleMode,
  onToggleRotated,
  onToggleFlipY,
  onOpenSheet,
}: {
  nodes: NodeRow[];
  edges: EdgeRow[];
  mapNow: number;
  colorOf: (owner: number | null) => string;
  kingdomList: KingdomInfo[];
  shortOf: (id: number) => string;
  rotated: boolean;
  flipY: boolean;
  mode: MapMode;
  fitToken: number;
  selectedId: number | null;
  selectedName: string | null;
  onSelectNode: (id: number) => void;
  onFit: () => void;
  onToggleMode: () => void;
  onToggleRotated: () => void;
  onToggleFlipY: () => void;
  onOpenSheet: () => void;
}) {
  const { t } = useT();

  const styleFor = useCallback(
    (node: NodeRow): NodeStyle => ({
      fill: colorOf(node.owner),
      ring: node.owner ? colorOf(node.owner) : null,
      flag: isStale(node.checkedAt, mapNow),
      shield: hasShield(node.shieldUntil, mapNow),
    }),
    [mapNow, colorOf],
  );

  const labelFor = useCallback(
    (node: NodeRow) => {
      const left = shieldSecondsLeft(node.shieldUntil, mapNow);
      return left > 0 ? formatDuration(left) : null;
    },
    [mapNow],
  );

  const totals = useMemo(() => {
    const byKingdom: Record<number, number> = Object.fromEntries(
      kingdomList.map((k) => [k.id, 0]),
    );
    let free = 0;
    let stale = 0;
    for (const node of nodes) {
      if (node.owner !== null && node.owner in byKingdom) {
        byKingdom[node.owner] += 1;
      } else {
        free += 1;
      }
      if (isStale(node.checkedAt, mapNow)) stale += 1;
    }
    return { byKingdom, free, stale };
  }, [nodes, mapNow, kingdomList]);

  return (
    <>
      <MapCanvas
        nodes={nodes}
        edges={edges}
        rotated={rotated}
        flipY={flipY}
        selectedId={selectedId}
        onSelectNode={onSelectNode}
        styleFor={styleFor}
        labelFor={labelFor}
        mode={mode}
        fitToken={fitToken}
        toolbar={
          <>
            <button className="btn !min-h-10 text-xs" onClick={onFit}>
              <Crosshair size={14} />
              {t("map.fit")}
            </button>
            <button
              className={`btn !min-h-10 text-xs ${mode === "buff" ? "border-[var(--color-accent)]" : ""}`}
              onClick={onToggleMode}
              title={t("map.buffsHint")}
            >
              <Swords size={14} />
              {t("map.buffs")}
            </button>
            <button
              className={`btn !min-h-10 text-xs ${rotated ? "border-[var(--color-accent)]" : ""}`}
              onClick={onToggleRotated}
              title={t("map.rot45Hint")}
            >
              <RotateCcw size={14} />
              {t("map.rot45")}
            </button>
            <button
              className={`btn !min-h-10 text-xs ${flipY ? "border-[var(--color-accent)]" : ""}`}
              onClick={onToggleFlipY}
              title={t("map.flipYHint")}
            >
              {t("map.flipY")}
            </button>
            <button
              className="btn !min-h-10 text-xs lg:hidden"
              onClick={onOpenSheet}
            >
              <List size={14} />
              {totals.stale > 0 && (
                <span className="text-[var(--color-warn)]">{totals.stale}</span>
              )}
            </button>
          </>
        }
        status={
          selectedName ? (
            <span className="flex items-center gap-2">
              <b>{selectedName}</b>
              <button
                className="btn btn-ghost !min-h-8 !px-2 text-xs lg:hidden"
                onClick={onOpenSheet}
              >
                {t("own.title")}
              </button>
            </span>
          ) : (
            <span className="text-[var(--color-text-soft)]">{t("map.ownHint")}</span>
          )
        }
        empty={
          <p className="text-sm text-[var(--color-text-dim)]">
            {t("map.addNodesFirst")}
          </p>
        }
      />

      <div className="pointer-events-none absolute end-2 top-2 flex flex-col items-end gap-1">
        {kingdomList.map((k) => (
          <span
            key={k.id}
            className="mono max-w-32 truncate rounded-lg border bg-[var(--color-panel)]/95 px-2 py-1 text-xs backdrop-blur"
            style={{ color: k.color }}
          >
            {shortOf(k.id)} {totals.byKingdom[k.id]}
          </span>
        ))}
        <span className="mono rounded-lg border bg-[var(--color-panel)]/95 px-2 py-1 text-xs text-[var(--color-text-dim)] backdrop-blur">
          — {totals.free}
        </span>
      </div>
    </>
  );
});

/**
 * One tap sets the owner — the whole point of this screen. No form, no
 * confirmation: if updating ownership ever becomes a chore, officers stop
 * doing it and the map goes stale.
 */
function OwnerButton({
  kingdom,
  active,
  disabled,
  onClick,
}: {
  kingdom: KingdomInfo;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={kingdom.name ?? undefined}
      className="mono min-h-11 truncate rounded-lg border px-1 text-xs font-semibold transition-colors"
      style={{
        color: active ? "#0b0f17" : kingdom.color,
        background: active ? kingdom.color : "transparent",
        borderColor: kingdom.color,
      }}
    >
      {kingdomShort(kingdom)}
    </button>
  );
}

/** Owner buttons, the "nothing changed" confirmation, and the shield timer. */
function NodePanel({
  node,
  now,
  who,
  pending,
  readOnly,
  onClose,
  run,
}: {
  node: NodeRow;
  now: number;
  who: string;
  pending: boolean;
  readOnly: boolean;
  onClose: () => void;
  run: (fn: () => void) => void;
}) {
  const { t } = useT();
  const { list: kingdomList, labelOf } = useKingdoms();
  const [days, setDays] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");

  const left = shieldSecondsLeft(node.shieldUntil, now);
  const stale = isStale(node.checkedAt, now);
  const ago = node.checkedAt ? now - node.checkedAt : null;

  return (
    <div className="border-b p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <KindIcon kind={node.kind} size={15} />
          <span className="truncate">{node.name}</span>
        </span>
        <button
          className="btn btn-ghost !min-h-9 !min-w-9 !px-0"
          onClick={onClose}
          title={t("map.deselect")}
        >
          <X size={14} />
        </button>
      </div>
      <p className="mono mb-3 text-xs text-[var(--color-text-dim)]">
        {node.x}:{node.y} · {t(KIND_KEY[node.kind])} · {t("table.level")}{" "}
        {node.level}
      </p>

      <p className="label">{t("own.title")}</p>
      {readOnly ? (
        <p className="mb-2 rounded-lg border px-2 py-2 text-xs text-[var(--color-text-dim)]">
          {labelOf(node.owner)} · {t("auth.readonly")}
        </p>
      ) : (
      <>
      {/* Auto-fills so the row still reads with three kingdoms or six. */}
      <div className="mb-2 grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1">
        {kingdomList.map((k) => (
          <OwnerButton
            key={k.id}
            kingdom={k}
            active={node.owner === k.id}
            disabled={pending}
            onClick={() => run(() => void setOwner(node.id, k.id, who))}
          />
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => void setOwner(node.id, null, who))}
          className={`min-h-11 rounded-lg border text-xs transition-colors ${
            node.owner === null
              ? "bg-[var(--color-text-dim)] text-[#0b0f17]"
              : "text-[var(--color-text-dim)]"
          }`}
          title={t("own.free")}
        >
          —
        </button>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => void confirmNode(node.id, who))}
        className="btn min-h-11 w-full text-xs"
      >
        <Check size={14} />
        {t("own.confirm")}
      </button>
      </>
      )}

      <p
        className={`mt-2 text-[11px] ${
          stale ? "text-[var(--color-warn)]" : "text-[var(--color-text-dim)]"
        }`}
      >
        {ago === null
          ? t("own.never")
          : t("own.checked", { ago: formatAgo(ago) })}
        {stale && ` · ${t("own.stale", { h: STALE_AFTER_HOURS })}`}
      </p>

      <div className="mt-3 rounded-lg border p-2">
        <p className="label">{t("shield.title")}</p>
        {left > 0 ? (
          <div className="flex items-center justify-between gap-2">
            <span className="mono text-sm text-[#7dd3fc]">
              {t("shield.left", { time: formatDuration(left) })}
            </span>
            {!readOnly && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => void clearShield(node.id, who))}
                className="btn btn-ghost !min-h-9 !px-2 text-xs"
              >
                {t("shield.clear")}
              </button>
            )}
          </div>
        ) : (
          <p className="mb-2 text-xs text-[var(--color-text-dim)]">
            {t("shield.none")}
          </p>
        )}

        {!readOnly && (
        <div className="mt-2">
          {/* Three equal fields, then the button on its own row: at 340px a
              fourth item on the line squeezes the taps below thumb size. */}
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="label" htmlFor={`d-${node.id}`}>
                {t("shield.days")}
              </label>
              <input
                id={`d-${node.id}`}
                className="field mono !py-1.5"
                type="number"
                inputMode="numeric"
                min={0}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="1"
              />
            </div>
            <div>
              <label className="label" htmlFor={`h-${node.id}`}>
                {t("shield.hours")}
              </label>
              <input
                id={`h-${node.id}`}
                className="field mono !py-1.5"
                type="number"
                inputMode="numeric"
                min={0}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="7"
              />
            </div>
            <div>
              <label className="label" htmlFor={`m-${node.id}`}>
                {t("shield.minutes")}
              </label>
              <input
                id={`m-${node.id}`}
                className="field mono !py-1.5"
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="41"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={pending || (!days && !hours && !minutes)}
            onClick={() =>
              run(() => {
                void setShield(
                  node.id,
                  Number(days) || 0,
                  Number(hours) || 0,
                  Number(minutes) || 0,
                  who,
                );
                setDays("");
                setHours("");
                setMinutes("");
              })
            }
            className="btn btn-primary mt-1.5 !min-h-10 w-full text-xs"
          >
            <ShieldPlus size={14} />
            {t("shield.set")}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
