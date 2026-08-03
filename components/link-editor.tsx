"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Crosshair, List, RotateCcw, Search, Trash2, X } from "lucide-react";
import { deleteEdge, toggleEdge } from "@/app/actions/edges";
import { normalizePair, type EdgeRow, type NodeRow } from "@/db/schema";
import { KIND_ACCENT } from "@/lib/constants";
import { useT } from "./i18n-provider";
import { KindIcon } from "./kind-icon";
import { useKingdoms } from "./kingdoms-provider";
import { MapCanvas, type NodeStyle } from "./map-canvas";
import { useRole } from "./role-provider";

export function LinkEditor({
  nodes,
  edges,
}: {
  nodes: NodeRow[];
  edges: EdgeRow[];
}) {
  const { t } = useT();
  const { canEdit } = useRole();
  const { colorOf } = useKingdoms();
  const [rotated, setRotated] = useState(true);
  const [flipY, setFlipY] = useState(false);
  const [fitToken, setFitToken] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Optimistic copy so a tap draws the road immediately; the server
  // revalidation replaces it with the stored row a moment later.
  const [localEdges, setLocalEdges] = useState(edges);
  useEffect(() => setLocalEdges(edges), [edges]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const edgeKey = (a: number, b: number) => normalizePair(a, b).join("-");
  const edgeSet = useMemo(
    () => new Set(localEdges.map((e) => edgeKey(e.aId, e.bId))),
    [localEdges],
  );

  const neighbours = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const e of localEdges) {
      if (!m.has(e.aId)) m.set(e.aId, []);
      if (!m.has(e.bId)) m.set(e.bId, []);
      m.get(e.aId)!.push(e.bId);
      m.get(e.bId)!.push(e.aId);
    }
    return m;
  }, [localEdges]);

  const pickNode = useCallback(
    (id: number) => {
      setError(null);
      // Non-admins may look at the road network but not rewire it.
      if (!canEdit) {
        setSelected(selected === id ? null : id);
        return;
      }
      if (selected === null || selected === id) {
        setSelected(selected === id ? null : id);
        return;
      }

      const [aId, bId] = normalizePair(selected, id);
      const exists = edgeSet.has(edgeKey(aId, bId));

      setLocalEdges((prev) =>
        exists
          ? prev.filter((e) => !(e.aId === aId && e.bId === bId))
          : [...prev, { id: -Date.now(), aId, bId }],
      );
      // Chain from the node just linked — that is how roads get traced.
      setSelected(id);

      startTransition(async () => {
        const res = await toggleEdge(aId, bId);
        if (!res.ok) {
          setError(t(res.error ?? "err.link_failed"));
          setLocalEdges(edges);
        }
      });
    },
    [selected, edgeSet, edges, t, canEdit],
  );

  const removeEdge = useCallback(
    (edge: EdgeRow) => {
      if (!canEdit) return;
      setLocalEdges((prev) => prev.filter((e) => e.id !== edge.id));
      startTransition(async () => {
        if (edge.id > 0) await deleteEdge(edge.id);
        else await toggleEdge(edge.aId, edge.bId);
      });
    },
    [canEdit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const styleFor = useCallback(
    (node: NodeRow): NodeStyle => ({
      fill: KIND_ACCENT[node.kind],
      ring: node.kingdom ? colorOf(node.kingdom) : null,
      outline:
        selected !== null && (neighbours.get(selected)?.includes(node.id) ?? false)
          ? "#e6ebf5"
          : null,
    }),
    [selected, neighbours, colorOf],
  );

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter(
      (node) =>
        node.name.toLowerCase().includes(q) || `${node.x}:${node.y}`.includes(q),
    );
  }, [nodes, query]);

  const selectedNode = selected !== null ? byId.get(selected) : undefined;

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
        <p className="mt-2 text-xs text-[var(--color-text-dim)]">
          {t("map.counts", { nodes: nodes.length, edges: localEdges.length })}
        </p>
      </div>

      {selectedNode && (
        <div className="border-b p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
              <KindIcon kind={selectedNode.kind} size={14} />
              <span className="truncate">{selectedNode.name}</span>
            </span>
            <button
              className="btn btn-ghost !px-2 !py-1"
              onClick={() => setSelected(null)}
              title={t("map.deselect")}
            >
              <X size={13} />
            </button>
          </div>
          <p className="mono mb-2 text-xs text-[var(--color-text-dim)]">
            {selectedNode.x}:{selectedNode.y} · {t("table.level")}{" "}
            {selectedNode.level}
          </p>

          <p className="label">
            {t("map.roads", { n: neighbours.get(selectedNode.id)?.length ?? 0 })}
          </p>
          <ul className="space-y-1">
            {(neighbours.get(selectedNode.id) ?? []).map((nid) => {
              const other = byId.get(nid);
              if (!other) return null;
              const [aId, bId] = normalizePair(selectedNode.id, nid);
              const edge = localEdges.find(
                (e) => e.aId === aId && e.bId === bId,
              );
              return (
                <li
                  key={nid}
                  className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs"
                >
                  <KindIcon kind={other.kind} size={13} />
                  <button
                    className="min-w-0 flex-1 truncate py-1 text-start hover:text-[var(--color-accent)]"
                    onClick={() => setSelected(nid)}
                  >
                    {other.name}
                  </button>
                  <button
                    className="btn btn-ghost !min-h-8 !min-w-8 !px-0"
                    title={t("map.removeRoad")}
                    onClick={() => edge && removeEdge(edge)}
                  >
                    <Trash2 size={13} className="text-[var(--color-danger)]" />
                  </button>
                </li>
              );
            })}
            {(neighbours.get(selectedNode.id)?.length ?? 0) === 0 && (
              <li className="text-xs text-[var(--color-text-dim)]">
                {t("map.noRoads")}
              </li>
            )}
          </ul>
        </div>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {listed.map((node) => {
          const count = neighbours.get(node.id)?.length ?? 0;
          return (
            <li key={node.id}>
              <button
                onClick={() => pickNode(node.id)}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-start text-xs transition-colors hover:bg-[var(--color-panel-2)] ${
                  selected === node.id ? "bg-[var(--color-panel-2)]" : ""
                }`}
              >
                <KindIcon kind={node.kind} size={14} />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                <span className="mono text-[10px] text-[var(--color-text-dim)]">
                  {node.x}:{node.y}
                </span>
                <span
                  className={`mono min-w-4 rounded px-1 text-center text-[10px] ${
                    count === 0
                      ? "bg-[var(--color-danger)]/15 text-[var(--color-danger)]"
                      : "text-[var(--color-text-dim)]"
                  }`}
                >
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <div className="grid h-[calc(100svh-6rem)] max-h-[calc(100svh-6rem)] grid-cols-1 overflow-hidden lg:grid-cols-[1fr_320px]">
      <div className="relative min-h-0 lg:border-e">
        <MapCanvas
          nodes={nodes}
          edges={localEdges}
          rotated={rotated}
          flipY={flipY}
          selectedId={selected}
          onSelectNode={pickNode}
          onEdgeClick={removeEdge}
          styleFor={styleFor}
          fitToken={fitToken}
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
                title={t("map.rot45Hint")}
              >
                <RotateCcw size={14} />
                {t("map.rot45")}
              </button>
              <button
                className={`btn !min-h-10 text-xs ${flipY ? "border-[var(--color-accent)]" : ""}`}
                onClick={() => setFlipY((v) => !v)}
                title={t("map.flipYHint")}
              >
                {t("map.flipY")}
              </button>
              <button
                className="btn !min-h-10 text-xs lg:hidden"
                onClick={() => setSheetOpen(true)}
              >
                <List size={14} />
              </button>
            </>
          }
          status={
            error ? (
              <span className="text-[var(--color-danger)]">{error}</span>
            ) : selectedNode ? (
              <>
                {t("map.selected", { name: selectedNode.name })}{" "}
                <button
                  className="underline decoration-dotted"
                  onClick={() => setSelected(null)}
                >
                  {t("map.reset")}
                </button>
              </>
            ) : (
              <span className="text-[var(--color-text-soft)]">
                {t("map.hint")}
              </span>
            )
          }
          empty={
            <p className="text-sm text-[var(--color-text-dim)]">
              {t("map.addNodesFirst")}
            </p>
          }
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
          <div className="absolute inset-x-0 bottom-0 flex max-h-[75dvh] flex-col rounded-t-2xl border-t bg-[var(--color-panel)]">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">{t("nav.links")}</span>
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
