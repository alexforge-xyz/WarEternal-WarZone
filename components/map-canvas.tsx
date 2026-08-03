"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EdgeRow, NodeKind, NodeRow } from "@/db/schema";
import { BUFF_COLOR } from "@/lib/constants";
import { dominantBuff, type BuffField } from "./buff-icon";

/**
 * Shared map surface: coordinate layout, pan, wheel zoom, pinch zoom, and the
 * node/road drawing. Both screens use it — `/links` to wire roads, `/map` to
 * work with ownership — so the gesture handling exists once.
 *
 * Performance notes (phones):
 * - Pan updates the SVG viewBox via the DOM; React only re-renders when zoom
 *   (and thus mark size / label LOD) changes, or when the gesture ends.
 * - Glyphs are cheap <symbol>/<use> paths, not 231 Lucide React trees.
 * - Edge strokes use non-scaling-stroke so width stays correct without a
 *   re-render on every pan frame.
 */

type View = { x: number; y: number; w: number; h: number };
type Pt = { node: NodeRow; px: number; py: number };
type Detail = "full" | "compact" | "none";

/**
 * What each node says about itself.
 *
 *   kind — the object: castle, gate, turret, crown for the throne in the middle
 *   buff — what holding it grants: the buff glyph and its percent
 *
 * Ownership colour is the same in both, because "who holds it" is the question
 * the map exists to answer and it never gets traded away for something else.
 */
export type MapMode = "kind" | "buff";

export type NodeStyle = {
  /** Mark fill. */
  fill: string;
  /** Ring drawn outside the mark, e.g. the owning kingdom. */
  ring?: string | null;
  /** Mark outline, used to pick out neighbours of the selection. */
  outline?: string | null;
  /** Yellow attention marker for data nobody has confirmed lately. */
  flag?: boolean;
  /** Translucent dome, drawn when a shield is up. */
  shield?: boolean;
};

/** Screen-space radius of a node mark, in CSS pixels, per kind. */
const MARK_PX: Record<NodeKind, number> = {
  city: 11,
  gate: 11,
  turret: 10,
  castle: 18,
  base: 15,
};

/** Glyph drawn inside the disc, as a share of the disc's diameter. */
const GLYPH_RATIO = 1.3;

/** Ink for the glyph — dark enough to read on every palette colour. */
const GLYPH_INK = "#0b0f17";

/**
 * Zoom thresholds, in map units per CSS pixel: below the first every node
 * carries its full name, below the second only its level, and past that the
 * glyphs carry the map alone.
 *
 * The map's closest neighbours sit ~37 units apart, so a name only has room
 * around it below ~0.4 — measured, not guessed. Set it looser and the names
 * overlap into an unreadable grey smear at exactly the zoom where the whole
 * board is on screen.
 */
const NAME_UNTIL = 0.4;
const LEVEL_UNTIL = 4.5;

const MIN_W = 4;
const MAX_W = 400_000;

function detailOf(v: View, cssW: number): Detail {
  const k = v.w / Math.max(cssW, 1);
  return k < NAME_UNTIL ? "full" : k < LEVEL_UNTIL ? "compact" : "none";
}

function viewBoxAttr(v: View): string {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}

/** Lightweight map glyphs (24×24). One symbol each, reused via <use>. */
function MapGlyphDefs() {
  const stroke = {
    fill: "none" as const,
    stroke: GLYPH_INK,
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <defs>
      {/* kind */}
      <symbol id="mg-city" viewBox="0 0 24 24">
        <path {...stroke} d="M4 20V10l8-6 8 6v10H4z" />
        <path {...stroke} d="M10 20v-6h4v6" />
      </symbol>
      <symbol id="mg-gate" viewBox="0 0 24 24">
        <path {...stroke} d="M5 20V9a7 7 0 0 1 14 0v11" />
        <path {...stroke} d="M9 20v-6h6v6" />
      </symbol>
      <symbol id="mg-turret" viewBox="0 0 24 24">
        <path {...stroke} d="M8 20V9l4-5 4 5v11H8z" />
        <path {...stroke} d="M8 11h8" />
      </symbol>
      <symbol id="mg-castle" viewBox="0 0 24 24">
        <path
          {...stroke}
          d="M5 16l2.5-3 2.5 2 2-4 2 4 2.5-2L19 16v4H5v-4z"
        />
        <path {...stroke} d="M12 5v4M9 7h6" />
      </symbol>
      <symbol id="mg-base" viewBox="0 0 24 24">
        <path {...stroke} d="M7 21V4" />
        <path {...stroke} d="M7 5h9l-2 3 2 3H7" />
      </symbol>
      {/* buff */}
      <symbol id="mg-buffAtk" viewBox="0 0 24 24">
        <path {...stroke} d="M14.5 4.5l5 5M12 7l-7 7 3 3 7-7M5 19l3-1" />
      </symbol>
      <symbol id="mg-buffDef" viewBox="0 0 24 24">
        <path {...stroke} d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      </symbol>
      <symbol id="mg-buffHp" viewBox="0 0 24 24">
        <path
          {...stroke}
          d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z"
        />
      </symbol>
    </defs>
  );
}

const KIND_GLYPH_ID: Record<NodeKind, string> = {
  city: "#mg-city",
  gate: "#mg-gate",
  turret: "#mg-turret",
  castle: "#mg-castle",
  base: "#mg-base",
};

const BUFF_GLYPH_ID: Record<BuffField, string> = {
  buffAtk: "#mg-buffAtk",
  buffDef: "#mg-buffDef",
  buffHp: "#mg-buffHp",
};

function MapCanvasImpl({
  nodes,
  edges,
  rotated,
  flipY,
  selectedId,
  onSelectNode,
  onEdgeClick,
  styleFor,
  labelFor,
  mode = "kind",
  fitToken = 0,
  toolbar,
  status,
  empty,
}: {
  nodes: NodeRow[];
  edges: EdgeRow[];
  rotated: boolean;
  flipY: boolean;
  selectedId: number | null;
  onSelectNode: (id: number) => void;
  onEdgeClick?: (edge: EdgeRow) => void;
  styleFor: (node: NodeRow) => NodeStyle;
  /** Extra text under the name, e.g. a shield countdown. */
  labelFor?: (node: NodeRow) => string | null;
  /** What the glyphs and labels describe. Defaults to the object itself. */
  mode?: MapMode;
  /** Bump to re-fit the view from outside. */
  fitToken?: number;
  toolbar?: React.ReactNode;
  status?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [view, setView] = useState<View>({ x: 0, y: 0, w: 100, h: 100 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const detailRef = useRef<Detail>("none");
  const rafReactRef = useRef<number | null>(null);
  const ptsRef = useRef<Pt[]>([]);

  const pts = useMemo<Pt[]>(
    () =>
      nodes.map((node) => {
        const px = rotated ? node.x - node.y : node.x;
        const py = (rotated ? (node.x + node.y) / 2 : node.y) * (flipY ? -1 : 1);
        return { node, px, py };
      }),
    [nodes, rotated, flipY],
  );
  ptsRef.current = pts;

  const byId = useMemo(() => new Map(pts.map((p) => [p.node.id, p])), [pts]);

  // Until the wrapper has been measured, `size` is a placeholder and any fit
  // computed from it would frame the map against the wrong aspect.
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      if (w < 2 || h < 2) return;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      setMeasured(true);
    };
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      apply(r.width, r.height);
    });
    ro.observe(el);
    const br = el.getBoundingClientRect();
    apply(br.width, br.height);
    return () => ro.disconnect();
  }, []);

  /** Push the camera into the SVG without React. Safe while k is unchanged. */
  const paintViewBox = useCallback((v: View) => {
    viewRef.current = v;
    const svg = svgRef.current;
    if (svg) svg.setAttribute("viewBox", viewBoxAttr(v));
  }, []);

  /** Commit camera to React (mark sizes, labels, stroke fallbacks). */
  const commitView = useCallback((v: View) => {
    viewRef.current = v;
    detailRef.current = detailOf(v, sizeRef.current.w);
    const svg = svgRef.current;
    if (svg) svg.setAttribute("viewBox", viewBoxAttr(v));
    setView(v);
  }, []);

  /**
   * Coalesce zoom updates to one React render per frame. Pan stays DOM-only
   * until the gesture ends (k is constant while only x/y move).
   */
  const scheduleZoomView = useCallback(
    (v: View) => {
      paintViewBox(v);
      if (rafReactRef.current != null) return;
      rafReactRef.current = requestAnimationFrame(() => {
        rafReactRef.current = null;
        commitView(viewRef.current);
      });
    },
    [paintViewBox, commitView],
  );

  useEffect(() => {
    return () => {
      if (rafReactRef.current != null) cancelAnimationFrame(rafReactRef.current);
    };
  }, []);

  const fit = useCallback(() => {
    if (!pts.length) {
      commitView({ x: -50, y: -50, w: 100, h: (100 * size.h) / size.w });
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.px);
      maxX = Math.max(maxX, p.px);
      minY = Math.min(minY, p.py);
      maxY = Math.max(maxY, p.py);
    }
    const aspect = size.h / size.w;
    let w = Math.max(maxX - minX, 1) * 1.3;
    let h = Math.max(maxY - minY, 1) * 1.3;
    if (h / w < aspect) h = w * aspect;
    else w = h / aspect;
    commitView({
      x: (minX + maxX) / 2 - w / 2,
      y: (minY + maxY) / 2 - h / 2,
      w,
      h,
    });
  }, [pts, size, commitView]);

  /**
   * Re-fit only on the things that actually invalidate the framing — never on
   * a plain resize. Someone who has zoomed in on a corner keeps it when the
   * phone rotates or the sidebar opens, and a stray pixel of layout jitter
   * can no longer throw the view around.
   */
  const fitKey = `${fitToken}|${rotated}|${flipY}|${nodes.length > 0}|${measured}`;
  const lastFit = useRef("");
  useEffect(() => {
    if (lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    fit();
  }, [fitKey, fit]);

  /**
   * A resize still has to be honoured, or the map would stretch: the viewBox
   * keeps its width and takes the container's aspect, growing or shrinking
   * around the centre of what is on screen.
   */
  const aspect = size.h / Math.max(size.w, 1);
  useEffect(() => {
    const v = viewRef.current;
    const h = v.w * aspect;
    if (Math.abs(h - v.h) < 1e-6) return;
    commitView({ ...v, y: v.y + (v.h - h) / 2, h });
  }, [aspect, commitView]);

  /* ---------------- wheel zoom ---------------- */

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      const v = viewRef.current;
      const w = Math.min(Math.max(v.w * factor, MIN_W), MAX_W);
      const h = w * (v.h / v.w);
      scheduleZoomView({
        x: v.x + (v.w - w) * mx,
        y: v.y + (v.h - h) * my,
        w,
        h,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scheduleZoomView]);

  /* ---------------- drag & pinch ---------------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{
    sx: number;
    sy: number;
    vx: number;
    vy: number;
    /** "touch" needs early capture or iOS steals the gesture for page scroll. */
    pointerType: string;
  } | null>(null);
  const pinch = useRef<{
    dist: number;
    mx: number;
    my: number;
    view: View;
  } | null>(null);
  const moved = useRef(false);

  function localFromClient(clientX: number, clientY: number) {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function capture(e: React.PointerEvent) {
    const el = e.currentTarget as Element;
    if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Real phones start a document scroll the moment the finger moves, unless
    // we own the pointer *now*. Desktop still defers capture so node clicks
    // hit the <g>, not the svg surface (see onPointerMove).
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      e.preventDefault();
      capture(e);
    }
    pointers.current.set(e.pointerId, localFromClient(e.clientX, e.clientY));

    if (pointers.current.size === 2) {
      capture(e);
      const [a, b] = [...pointers.current.values()];
      const sw = Math.max(sizeRef.current.w, 1);
      const sh = Math.max(sizeRef.current.h, 1);
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      pinch.current = {
        dist,
        mx: (a.x + b.x) / 2 / sw,
        my: (a.y + b.y) / 2 / sh,
        view: viewRef.current,
      };
      drag.current = null;
      moved.current = true;
      return;
    }
    if (pointers.current.size === 1) {
      const v = viewRef.current;
      drag.current = {
        sx: e.clientX,
        sy: e.clientY,
        vx: v.x,
        vy: v.y,
        pointerType: e.pointerType,
      };
      moved.current = false;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      e.preventDefault();
    }
    pointers.current.set(e.pointerId, localFromClient(e.clientX, e.clientY));

    const sw = Math.max(sizeRef.current.w, 1);
    const sh = Math.max(sizeRef.current.h, 1);

    const p = pinch.current;
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const w = Math.min(Math.max((p.view.w * p.dist) / dist, MIN_W), MAX_W);
      const h = w * (p.view.h / p.view.w);
      const anchorX = p.view.x + p.view.w * p.mx;
      const anchorY = p.view.y + p.view.h * p.my;
      const cmx = (a.x + b.x) / 2 / sw;
      const cmy = (a.y + b.y) / 2 / sh;
      scheduleZoomView({
        x: anchorX - w * cmx,
        y: anchorY - h * cmy,
        w,
        h,
      });
      return;
    }

    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    const slop = d.pointerType === "touch" || d.pointerType === "pen" ? 10 : 4;
    if (Math.abs(dx) > slop || Math.abs(dy) > slop) {
      moved.current = true;
      // Mouse: capture only once it's clearly a drag (keeps node clicks working).
      if (d.pointerType === "mouse") capture(e);
    }
    if (!moved.current) return;
    const v = viewRef.current;
    // Pan only: DOM viewBox. k is unchanged, so marks/labels stay correct
    // without a full React pass on every finger pixel.
    paintViewBox({
      ...v,
      x: d.vx - (dx * v.w) / sw,
      y: d.vy - (dy * v.h) / sh,
    });
  }

  function pickNodeAtClient(clientX: number, clientY: number) {
    // Touch capture steals the synthetic click target; hit-test nodes ourselves.
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return;
    const v = viewRef.current;
    const mx = v.x + ((clientX - rect.left) / rect.width) * v.w;
    const my = v.y + ((clientY - rect.top) / rect.height) * v.h;
    const k = v.w / Math.max(rect.width, 1);
    let best: { id: number; d2: number } | null = null;
    for (const { node, px, py } of ptsRef.current) {
      const r = MARK_PX[node.kind] * k * 1.6;
      const ddx = mx - px;
      const ddy = my - py;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 <= r * r && (!best || d2 < best.d2)) {
        best = { id: node.id, d2 };
      }
    }
    if (best) onSelectNode(best.id);
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasTap =
      !moved.current &&
      (e.pointerType === "touch" || e.pointerType === "pen") &&
      pointers.current.size <= 1 &&
      !pinch.current;
    pointers.current.delete(e.pointerId);
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      // Flush any DOM-only pan (or pending zoom rAF) into React so the next
      // data re-render does not snap the camera back.
      if (rafReactRef.current != null) {
        cancelAnimationFrame(rafReactRef.current);
        rafReactRef.current = null;
      }
      commitView(viewRef.current);
    }
    if (wasTap) pickNodeAtClient(e.clientX, e.clientY);
  }

  function onPointerLeave(e: React.PointerEvent) {
    if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      commitView(viewRef.current);
    }
  }

  // Non-passive touchmove: iOS still rubber-bands the document unless we call
  // preventDefault here (touch-action alone is not enough on some versions).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const block = (ev: TouchEvent) => {
      ev.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => {
      el.removeEventListener("touchmove", block);
    };
  }, []);

  /** SVG units per CSS pixel — keeps marks and labels a constant screen size. */
  const k = view.w / Math.max(size.w, 1);
  const detail = detailOf(view, size.w);
  detailRef.current = detail;

  // Precompute styles once per styleFor identity (parent throttles the clock).
  const styles = useMemo(() => {
    const m = new Map<number, NodeStyle>();
    for (const { node } of pts) m.set(node.id, styleFor(node));
    return m;
  }, [pts, styleFor]);

  return (
    <div
      className="relative h-full w-full overscroll-none"
      ref={wrapRef}
      style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
    >
      {/*
        Absolutely positioned on purpose. An in-flow <svg> with a viewBox has
        an *intrinsic aspect ratio*, so it reports a content height — and this
        one's aspect changes every time the view does. In flow that closes a
        loop: taller svg -> page scrollbar -> 10px narrower -> re-fit -> new
        aspect -> shorter svg -> no scrollbar -> wider -> ... The map visibly
        pumped in and out forever. Out of flow it can only ever be the size
        this wrapper already is.
      */}
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full select-none"
        style={{ touchAction: "none" }}
        viewBox={viewBoxAttr(view)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <MapGlyphDefs />

        <g>
          {edges.map((edge) => {
            const a = byId.get(edge.aId);
            const b = byId.get(edge.bId);
            if (!a || !b) return null;
            const touches =
              selectedId === edge.aId || selectedId === edge.bId;
            return (
              <g key={`${edge.aId}-${edge.bId}`}>
                <line
                  x1={a.px}
                  y1={a.py}
                  x2={b.px}
                  y2={b.py}
                  stroke={touches ? "#38bdf8" : "#3f4d69"}
                  strokeWidth={touches ? 4.8 : 3}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                {onEdgeClick && (
                  // Wide invisible line so a road is tappable on a phone.
                  // Hit width stays ~screen pixels via non-scaling-stroke.
                  <line
                    x1={a.px}
                    y1={a.py}
                    x2={b.px}
                    y2={b.py}
                    stroke="transparent"
                    strokeWidth={14}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: "pointer" }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (moved.current) return;
                      onEdgeClick(edge);
                    }}
                  />
                )}
              </g>
            );
          })}
        </g>

        <g>
          {pts.map(({ node, px, py }) => {
            const s = styles.get(node.id) ?? { fill: "#64748b" };
            const isSel = selectedId === node.id;
            const buff = mode === "buff" ? dominantBuff(node) : null;
            // In buff mode a node that grants nothing shrinks out of the way:
            // the whole point of the view is spotting what is worth taking.
            const r =
              MARK_PX[node.kind] * k * (mode === "buff" && !buff ? 0.45 : 1);
            const glyphId =
              mode === "buff"
                ? buff
                  ? BUFF_GLYPH_ID[buff.field]
                  : null
                : KIND_GLYPH_ID[node.kind];
            const gSize = r * GLYPH_RATIO;
            const extra =
              detail === "full" && labelFor ? labelFor(node) : null;

            return (
              <g
                key={node.id}
                transform={`translate(${px} ${py})`}
                style={{ cursor: "pointer" }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (moved.current) return;
                  onSelectNode(node.id);
                }}
              >
                {s.shield && (
                  <circle
                    r={r * 2.3}
                    fill="#38bdf8"
                    fillOpacity={0.16}
                    stroke="#7dd3fc"
                    strokeWidth={1.2 * k}
                  />
                )}
                {isSel && (
                  <circle
                    r={r * 2.7}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1.8 * k}
                    strokeDasharray={`${3 * k} ${2.5 * k}`}
                  />
                )}
                {s.ring && (
                  <circle
                    r={r * 1.55}
                    fill="none"
                    stroke={s.ring}
                    strokeWidth={2 * k}
                  />
                )}
                {/* Disc carries the colour, glyph carries the meaning. */}
                <circle
                  r={r}
                  fill={s.fill}
                  stroke={s.outline ?? "#0b0f17"}
                  strokeWidth={1.6 * k}
                />
                {glyphId && (
                  <use
                    href={glyphId}
                    x={-gSize / 2}
                    y={-gSize / 2}
                    width={gSize}
                    height={gSize}
                    style={{ pointerEvents: "none" }}
                  />
                )}
                {s.flag && (
                  <g transform={`translate(${r * 1.5} ${-r * 1.6})`}>
                    <circle
                      r={5.5 * k}
                      fill="#eab308"
                      stroke="#0b0f17"
                      strokeWidth={k}
                    />
                    <text
                      y={2 * k}
                      textAnchor="middle"
                      fontSize={8 * k}
                      fontWeight="700"
                      fill="#0b0f17"
                      style={{ pointerEvents: "none" }}
                    >
                      !
                    </text>
                  </g>
                )}
                {/* Finger-sized hit area for mouse; touch uses pickNodeAtClient. */}
                <circle r={Math.max(r * 1.6, 22 * k)} fill="transparent" />

                {mode === "buff"
                  ? buff &&
                    detail !== "none" && (
                      // The percent *is* the label here, and it is short
                      // enough to survive as far out as a level does.
                      <text
                        y={r + 15 * k}
                        textAnchor="middle"
                        fontSize={14 * k}
                        fontWeight="700"
                        fill={BUFF_COLOR[buff.field]}
                        style={{ pointerEvents: "none" }}
                      >
                        {buff.value}%
                      </text>
                    )
                  : detail !== "none" && (
                      <text
                        y={r + 15 * k}
                        textAnchor="middle"
                        fontSize={13 * k}
                        fill={isSel ? "#e6ebf5" : "#94a3b8"}
                        style={{ pointerEvents: "none" }}
                      >
                        {detail === "full" ? (
                          <>
                            {node.name}
                            <tspan fill="#64748b"> {node.level}</tspan>
                            {extra && (
                              <tspan x={0} dy={14 * k} fill="#7dd3fc">
                                {extra}
                              </tspan>
                            )}
                          </>
                        ) : (
                          // Zoomed out the name is unreadable anyway; the
                          // level is what you scan the map for.
                          <tspan fontWeight="700" fill="#8fa3bf">
                            {node.level}
                          </tspan>
                        )}
                      </text>
                    )}
              </g>
            );
          })}
        </g>
      </svg>

      {toolbar && (
        <div className="absolute start-2 top-2 flex flex-wrap gap-1.5">
          {toolbar}
        </div>
      )}

      {status && (
        <div className="pointer-events-none absolute bottom-2 start-2 end-2 flex justify-center">
          <div className="pointer-events-auto max-w-full rounded-lg border bg-[var(--color-panel)]/95 px-3 py-2 text-xs backdrop-blur">
            {status}
          </div>
        </div>
      )}

      {nodes.length === 0 && empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {empty}
        </div>
      )}
    </div>
  );
}

/** Skip re-renders when the parent only re-ticks for the side panel clock. */
export const MapCanvas = memo(MapCanvasImpl);
