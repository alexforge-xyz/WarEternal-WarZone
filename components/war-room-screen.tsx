"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  CircleHelp,
  Crosshair,
  MapIcon,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { addPlanPath } from "@/app/actions/plan";
import type { EdgeRow, NodeRow } from "@/db/schema";
import type { ChatMessage } from "@/lib/live-events";
import type { PlanSnapshot } from "@/lib/plan-types";
import { planEdgesFromPaths, computePlanStats } from "@/lib/plan-stats";
import {
  formatDurationShort,
  hasShield,
  shieldSecondsLeft,
} from "@/lib/staleness";
import { useT } from "./i18n-provider";
import { useKingdoms } from "./kingdoms-provider";
import { MapCanvas, type NodeStyle, type PlanEdgeSeg } from "./map-canvas";
import { useClock } from "./use-clock";
import { useLiveChat } from "./use-live-chat";
import { useLiveMap } from "./use-live-map";
import { useLivePlan } from "./use-live-plan";
import { WarRoomChat } from "./war-room-chat";
import { WarRoomHelp } from "./war-room-help";
import { WarRoomNodeSheet } from "./war-room-node-sheet";
import { WarRoomPlanPanel } from "./war-room-plan-panel";

/**
 * Officers' room: board + chat + shared expansion trails.
 *
 * Map ownership stays on `/` — here the map is for pointing, pinning chat, and
 * laying capture paths. Everyone edits one plan; shared nodes merge in cost.
 */

const MAP_CLOCK_STEP_S = 5;

export function WarRoomScreen({
  nodes: initialNodes,
  edges: initialEdges,
  messages: initialMessages,
  plan: initialPlan,
  serverNow,
  selfUserId,
}: {
  nodes: NodeRow[];
  edges: EdgeRow[];
  messages: ChatMessage[];
  plan: PlanSnapshot;
  serverNow: number;
  selfUserId: number;
}) {
  const { t } = useT();
  const { colorOf } = useKingdoms();

  const { nodes, edges } = useLiveMap(initialNodes, initialEdges);
  const { messages, append, typingNicks, live } = useLiveChat(
    initialMessages,
    selfUserId,
  );
  const { plan, setPlan } = useLivePlan(initialPlan);

  const now = useClock(serverNow);
  const mapNow = Math.floor(now / MAP_CLOCK_STEP_S) * MAP_CLOCK_STEP_S;

  const [selected, setSelected] = useState<number | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const [rotated, setRotated] = useState(true);
  const [tab, setTab] = useState<"map" | "chat">("chat");
  const [planError, setPlanError] = useState<string | null>(null);
  const [routing, startRoute] = useTransition();
  /** Long-press target — opens the blur sheet over the map. */
  const [menuNodeId, setMenuNodeId] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  const planNodeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of plan.paths) {
      for (const id of p.nodes) ids.add(id);
    }
    return ids;
  }, [plan.paths]);

  /** Nodes we still need to take (union) — these get the white–grey stage look. */
  const planCaptureIds = useMemo(() => {
    const kid = plan.planningKingdomId;
    const ids = new Set<number>();
    for (const id of planNodeIds) {
      const n = nodeById.get(id);
      if (!n) continue;
      if (kid != null && n.owner === kid) continue;
      ids.add(id);
    }
    return ids;
  }, [planNodeIds, nodeById, plan.planningKingdomId]);

  const noteCountById = useMemo(() => {
    const m = new Map<number, number>();
    for (const note of plan.notes ?? []) {
      m.set(note.nodeId, (m.get(note.nodeId) ?? 0) + 1);
    }
    return m;
  }, [plan.notes]);

  const planEdges: PlanEdgeSeg[] = useMemo(
    () => planEdgesFromPaths(plan.paths),
    [plan.paths],
  );

  const stats = useMemo(() => {
    const kid = plan.planningKingdomId ?? -1;
    return computePlanStats(planNodeIds, nodeById, kid);
  }, [planNodeIds, nodeById, plan.planningKingdomId]);

  const styleFor = useCallback(
    (node: NodeRow): NodeStyle => {
      const owned = node.owner != null;
      const color = colorOf(node.owner);
      const onPlan = planCaptureIds.has(node.id);
      const noteCount = noteCountById.get(node.id) ?? 0;
      // Chat pin is only a chip in the message list — no yellow outline.
      return {
        fill: color,
        ring: node.id === selected ? "#ffffff" : null,
        shield: hasShield(node.shieldUntil, mapNow),
        battle: node.battleSince != null,
        plan: onPlan,
        note: noteCount > 0,
        noteCount,
        zone: owned ? color : null,
      };
    },
    [colorOf, selected, mapNow, planCaptureIds, noteCountById],
  );

  /**
   * Same countdown the main map draws, and for a sharper reason here: when a
   * shielded gate is what the route is bending around, "how long until it
   * opens" is the number that decides whether to plan the detour at all.
   */
  const labelFor = useCallback(
    (node: NodeRow) => {
      const left = shieldSecondsLeft(node.shieldUntil, mapNow);
      return left > 0 ? formatDurationShort(left) : null;
    },
    [mapNow],
  );

  const routeTo = useCallback(
    (id: number) => {
      if (routing) return;

      const node = nodeById.get(id);
      // Own nodes are for chat pin only — no error toast, no server round-trip.
      if (
        node &&
        plan.planningKingdomId != null &&
        node.owner === plan.planningKingdomId
      ) {
        setPlanError(null);
        return;
      }

      // Client-side same rules as the server: mid-path taps must not invent a
      // stub trail that then "disappears" on the next toggle.
      const isTip = plan.paths.some(
        (p) => p.nodes.length > 0 && p.nodes[p.nodes.length - 1] === id,
      );
      const onPath = plan.paths.some((p) => p.nodes.includes(id));
      if (!isTip && onPath) {
        setPlanError(null);
        return;
      }

      setPlanError(null);
      startRoute(() => {
        void (async () => {
          const res = await addPlanPath(id);
          if (res.ok && res.plan) {
            setPlan(res.plan);
          } else if (res.error && res.error !== "plan.alreadyOurs") {
            // params carries the blocking gate's name — drop it and the
            // message degrades to "{name}" on screen.
            setPlanError(t(res.error, res.params));
          }
        })();
      });
    },
    [setPlan, t, nodeById, plan.planningKingdomId, plan.paths, routing],
  );

  const onSelectNode = useCallback(
    (id: number) => {
      setSelected(id);
      // Tip → toggle off; new target → new trail; mid-path → pin only.
      routeTo(id);
    },
    [routeTo],
  );

  const onPickNode = useCallback((id: number) => {
    setSelected(id);
    setTab("map");
    setFocusToken((v) => v + 1);
  }, []);

  const onLongPressNode = useCallback((id: number) => {
    setSelected(id);
    setMenuNodeId(id);
    setTab("map");
  }, []);

  const onShareChat = useCallback((id: number) => {
    setSelected(id);
    setTab("chat");
  }, []);

  const menuNode = menuNodeId != null ? nodeById.get(menuNodeId) : undefined;
  const menuNotes = useMemo(() => {
    if (menuNodeId == null) return [];
    return (plan.notes ?? []).filter((n) => n.nodeId === menuNodeId);
  }, [plan.notes, menuNodeId]);

  const map = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <WarRoomPlanPanel
        plan={plan}
        stats={stats}
        onPlan={setPlan}
        error={planError}
      />
      <div className="relative min-h-0 min-w-0 flex-1">
        <MapCanvas
          nodes={nodes}
          edges={edges}
          rotated={rotated}
          flipY={false}
          selectedId={selected}
          onSelectNode={onSelectNode}
          onLongPressNode={onLongPressNode}
          styleFor={styleFor}
          labelFor={labelFor}
          territory
          fitToken={fitToken}
          focusId={selected}
          focusToken={focusToken}
          planEdges={planEdges}
          toolbar={
            <>
              <button
                className="btn !min-h-10 text-xs"
                onClick={() => setFitToken((v) => v + 1)}
              >
                <Crosshair size={14} />
                {t("map.fit")}
              </button>
              <button
                className={`btn !min-h-10 text-xs ${rotated ? "border-[var(--color-accent)]" : ""}`}
                onClick={() => setRotated((v) => !v)}
              >
                <RotateCcw size={14} />
                {t("map.rot45")}
              </button>
            </>
          }
          toolbarEnd={
            <button
              type="button"
              className="btn !min-h-11 gap-1.5 border-[var(--color-accent)] !px-3 text-sm font-medium text-[var(--color-accent)]"
              onClick={() => setHelpOpen(true)}
              aria-label={t("warroom.help")}
            >
              <CircleHelp size={20} strokeWidth={2.25} />
              {t("warroom.help")}
            </button>
          }
          status={
            <span className="text-[11px] text-[var(--color-text-dim)]">
              {routing ? t("plan.routing") : t("warroom.mapHint")}
            </span>
          }
        />
        {menuNode ? (
          <WarRoomNodeSheet
            node={menuNode}
            inPlan={planNodeIds.has(menuNode.id)}
            isOurs={
              plan.planningKingdomId != null &&
              menuNode.owner === plan.planningKingdomId
            }
            notes={menuNotes}
            onClose={() => setMenuNodeId(null)}
            onPlan={setPlan}
            onShareChat={onShareChat}
          />
        ) : null}
        {helpOpen ? <WarRoomHelp onClose={() => setHelpOpen(false)} /> : null}
      </div>
    </div>
  );

  const chat = (
    <WarRoomChat
      messages={messages}
      onSent={append}
      nodeById={nodeById}
      selectedId={selected}
      onPickNode={onPickNode}
      typingNicks={typingNicks}
      live={live}
    />
  );

  return (
    // Fill `main` (layout locks the document to 100dvh). Never calc(100svh-…)
    // here — that ignored the footer and made the page taller than the screen,
    // so pan gestures scrolled the whole shell under the sticky header.
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b px-2 py-1.5 lg:hidden">
        <TabButton
          active={tab === "map"}
          onClick={() => setTab("map")}
          label={t("nav.map")}
          icon={<MapIcon size={14} />}
        />
        <TabButton
          active={tab === "chat"}
          onClick={() => setTab("chat")}
          label={t("chat.title")}
          icon={<MessageSquare size={14} />}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_380px]">
        <div
          className={`relative min-h-0 min-w-0 lg:block lg:border-e ${
            tab === "map" ? "flex h-full min-h-0 flex-col" : "hidden"
          }`}
        >
          {map}
        </div>
        <aside
          className={`min-h-0 min-w-0 flex-col bg-[var(--color-panel)] lg:flex ${
            tab === "chat" ? "flex" : "hidden"
          }`}
        >
          {chat}
        </aside>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors ${
        active
          ? "bg-[var(--color-panel-2)] text-[var(--color-text)]"
          : "text-[var(--color-text-soft)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
