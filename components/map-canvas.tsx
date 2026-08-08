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
import { BATTLE_COLOR, BUFF_COLOR } from "@/lib/constants";
import { dominantBuff, type BuffField } from "./buff-icon";
import { useT } from "./i18n-provider";

/**
 * Shared map surface: coordinate layout, pan, wheel zoom, pinch zoom, and the
 * node/road drawing. Both screens use it — `/links` to wire roads, `/map` to
 * work with ownership — so the gesture handling exists once.
 *
 * Performance notes (phones — S-series included, not a “weak phone” issue):
 * - Camera is a single `<g transform=matrix>` under a *fixed* viewBox in
 *   screen pixels. Changing `viewBox` every pan frame forces a full SVG
 *   re-raster on Android Chrome and reads as whole-page flicker; a matrix
 *   on one group can stay on the compositor.
 * - React only re-renders for cull / mark LOD (throttled on zoom, on pan end).
 * - Glyphs are `<symbol>`/`<use>`, not 231 Lucide React trees.
 * - Edge strokes use non-scaling-stroke so width stays correct under scale.
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
  /** Crossed swords, drawn while somebody reports a fight over this node. */
  battle?: boolean;
  /**
   * Node sits on the shared capture plan (expansion path). White–grey breathe
   * on the disc + slow dashed orbit — "active stage", not ownership colour.
   */
  plan?: boolean;
  /** War-room sticky notes — small cloud badge over the mark. */
  note?: boolean;
  /** How many notes (badge digit); only when `note` is true. */
  noteCount?: number;
  /**
   * Colour of the territory this node projects onto the board, or null for
   * "holds nothing". Only used by the zoomed-out view (see `territory`).
   */
  zone?: string | null;
};

/**
 * One directed hop of the capture plan. Light flows **a → b** (from our
 * territory toward a tip). When several branches leave a node, each segment
 * carries its own wave — the shared node is the merge, not a conflict.
 *
 * `hop` is distance from the root in steps; used only to stagger the wave so
 * it reads as a front expanding outward rather than every edge flashing in sync.
 */
export type PlanEdgeSeg = {
  aId: number;
  bId: number;
  hop?: number;
};

/** Screen-space radius of a node mark, in CSS pixels, per kind. */
const MARK_PX: Record<NodeKind, number> = {
  city: 11,
  gate: 11,
  turret: 10,
  castle: 18,
  base: 15,
};

/**
 * How much bigger a mark may get once there is room for it.
 *
 * The base sizes above are sized for the worst case — the whole-board fit,
 * where the closest pair of nodes is only ~9 CSS px apart and the discs
 * already touch. Every zoom past that leaves the marks swimming in space
 * while staying pinhead-sized, which is what made the glyphs unreadable.
 * So the mark grows with the gap it actually has instead of being frozen at
 * the density of the most crowded view.
 */
const MARK_BOOST_MAX = 1.6;

/** Closest pair of nodes on the surveyed map, in map units. Measured. */
const NEAREST_UNITS = 30;

/** Gap, in CSS px, at which a mark is allowed to reach MARK_BOOST_MAX. */
const ROOMY_GAP_PX = 26;

/** Mark scale for the current zoom: 1 when crowded, up to the max when not. */
function markBoost(k: number): number {
  const gapPx = NEAREST_UNITS / Math.max(k, 1e-6);
  return Math.min(MARK_BOOST_MAX, Math.max(1, gapPx / ROOMY_GAP_PX));
}

/** Glyph drawn inside the disc, as a share of the disc's radius. */
const GLYPH_RATIO = 1.5;

/**
 * The bare glyph in the territory view is *smaller* than the one inside a
 * disc, not bigger. Out there the nearest pair of nodes is ~8 px apart, so a
 * glyph sized to be read individually only overlaps its neighbours into a
 * lace pattern; at this size it reads as "objects are here, this many, this
 * kind" and lets the colour underneath do the talking.
 */
const FAR_GLYPH_RATIO = 1.15;

/** Held back so the territory colour, not the glyph mass, is what you see. */
const FAR_GLYPH_OPACITY = 0.42;

/**
 * And held back further the wider you go. A phone fits the whole board at
 * ~8 units per pixel — four times denser than a desktop — and at that packing
 * 231 glyphs stop being marks and become a mesh laid over the provinces. They
 * stay, faint, as texture that says "objects, this many"; the colour and the
 * roads carry the view.
 */
function farGlyphOpacity(k: number): number {
  const t = Math.min(1, Math.max(0, (k - TERRITORY_FROM) / 4));
  return FAR_GLYPH_OPACITY * (1 - 0.6 * t);
}

/** Ink for the glyph inside a disc — dark enough to read on every palette colour. */
const GLYPH_INK = "#0b0f17";

/** Ink for the bare glyph in the territory view, where there is no disc under it. */
const FAR_GLYPH_INK = "#dbe6f5";

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

/**
 * Shield countdowns get their own, much looser threshold: a shield is on the
 * handful of nodes somebody just took, not on all 231, so the labels have room
 * long before names do — and "when does this drop" is the one number an officer
 * wants while looking at a whole front, not after zooming into a single node.
 */
const SHIELD_UNTIL = 2;

/**
 * Past this the board stops being a list of objects and becomes a map of who
 * holds what: the discs come off, the roads stay, and every held node paints
 * its kingdom's colour onto the ground (see `TerritoryLayer`).
 *
 * The number is where the discs stop fitting. Nodes sit ~30 units apart at the
 * closest, so at 2 units per pixel that is a 15 px gap for marks 22 px across —
 * from here on they can only overlap into an unreadable pile, which is exactly
 * what the whole-board view used to be.
 */
const TERRITORY_FROM = 2;

const MIN_W = 4;
const MAX_W = 400_000;

/**
 * How far past the screen edge the board is still drawn, as a share of the
 * view. The rendered band is the viewport grown by this much on every side.
 *
 * Culling was tried once before and taken out again, because a pan is DOM-only
 * until the finger lifts: React had not re-rendered, so panning toward the edge
 * pulled *nothing* into view and left empty strips. The margin alone does not
 * fix that — it only buys time. What fixes it is watching the live camera
 * (`paintCamera`) and committing the moment it leaves the band, so the next
 * ring of nodes is mounted before there is any gap to see.
 *
 * 0.35 makes the band twice the viewport's area. Bigger wastes the saving;
 * smaller commits so often that the mid-gesture re-renders cost more than the
 * nodes they save — and they are only cheap because `MapNode` is memoised, so
 * a commit mounts the arrivals and walks past everything already there.
 */
const CULL_MARGIN = 0.35;

/** Slack in CSS px so a mark whose centre is just off-screen still draws. */
const CULL_PAD_PX = 60;

/** The view grown by `CULL_MARGIN` — what actually gets rendered. */
function bandFor(v: View): View {
  const mx = v.w * CULL_MARGIN;
  const my = v.h * CULL_MARGIN;
  return { x: v.x - mx, y: v.y - my, w: v.w + 2 * mx, h: v.h + 2 * my };
}

function bandHolds(band: View, v: View): boolean {
  return (
    v.x >= band.x &&
    v.y >= band.y &&
    v.x + v.w <= band.x + band.w &&
    v.y + v.h <= band.y + band.h
  );
}

function detailOf(v: View, cssW: number): Detail {
  const k = v.w / Math.max(cssW, 1);
  return k < NAME_UNTIL ? "full" : k < LEVEL_UNTIL ? "compact" : "none";
}

/** Fixed screen-space viewBox — camera lives on a group transform, not here. */
function screenViewBoxAttr(sw: number, sh: number): string {
  return `0 0 ${Math.max(sw, 1)} ${Math.max(sh, 1)}`;
}

/**
 * World → screen: scale then translate so world point (view.x, view.y) lands
 * at the top-left of the SVG. One matrix update pans/zooms without touching
 * every child attribute.
 */
/** CSS matrix for the world group (screen viewBox units ≈ CSS px). */
function cameraCssMatrix(v: View, sw: number, sh: number): string {
  const sx = sw / Math.max(v.w, 1e-9);
  const sy = sh / Math.max(v.h, 1e-9);
  return `matrix(${sx}, 0, 0, ${sy}, ${-v.x * sx}, ${-v.y * sy})`;
}

/**
 * The map glyphs are the *same lucide shapes* the node list and the side panel
 * draw through `KindIcon` / `BuffIcon` — a castle is the same castle wherever
 * you meet it, which is the whole point of an icon. They are inlined here as
 * `<symbol>` path data rather than imported as components because the map
 * mounts one per node: 231 Lucide React trees re-rendering on every zoom step
 * is a visibly slower phone, while 8 symbols reused via `<use>` is free.
 *
 * Copied verbatim from lucide-react v1 (ISC) — castle, door-open,
 * tower-control, crown, flag, swords, shield-half, heart. If lucide is
 * upgraded and a shape changes, re-copy from
 * `node_modules/lucide-react/dist/esm/icons/<name>.mjs`.
 */
function MapGlyphDefs() {
  // currentColor, not a literal: the same symbol is inked dark inside a
  // coloured disc up close and pale over the territory wash far out.
  const stroke = {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <defs>
      {/* kind — matches KIND_ICONS in components/kind-icon.tsx */}
      <symbol id="mg-city" viewBox="0 0 24 24">
        {/* castle */}
        <path {...stroke} d="M10 5V3" />
        <path {...stroke} d="M14 5V3" />
        <path {...stroke} d="M15 21v-3a3 3 0 0 0-6 0v3" />
        <path {...stroke} d="M18 3v8" />
        <path {...stroke} d="M18 5H6" />
        <path {...stroke} d="M22 11H2" />
        <path {...stroke} d="M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9" />
        <path {...stroke} d="M6 3v8" />
      </symbol>
      <symbol id="mg-gate" viewBox="0 0 24 24">
        {/* door-open */}
        <path {...stroke} d="M11 20H2" />
        <path
          {...stroke}
          d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"
        />
        <path {...stroke} d="M11 4H8a2 2 0 0 0-2 2v14" />
        <path {...stroke} d="M14 12h.01" />
        <path {...stroke} d="M22 20h-3" />
      </symbol>
      <symbol id="mg-turret" viewBox="0 0 24 24">
        {/* tower-control */}
        <path
          {...stroke}
          d="M18.2 12.27 20 6H4l1.8 6.27a1 1 0 0 0 .95.73h10.5a1 1 0 0 0 .96-.73Z"
        />
        <path {...stroke} d="M8 13v9" />
        <path {...stroke} d="M16 22v-9" />
        <path {...stroke} d="m9 6 1 7" />
        <path {...stroke} d="m15 6-1 7" />
        <path {...stroke} d="M12 6V2" />
        <path {...stroke} d="M13 2h-2" />
      </symbol>
      <symbol id="mg-castle" viewBox="0 0 24 24">
        {/* crown */}
        <path
          {...stroke}
          d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"
        />
        <path {...stroke} d="M5 21h14" />
      </symbol>
      <symbol id="mg-base" viewBox="0 0 24 24">
        {/* flag */}
        <path
          {...stroke}
          d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"
        />
      </symbol>
      {/*
        The "needs a check" badge, as one reusable shape.

        It used to be a group, a circle and an SVG `<text>` holding "!", per
        flagged node — and when every node is flagged that is 231 pieces of
        text to shape and lay out, at a font size that changes with every zoom
        step. It was measurable from the couch: clearing the flags made the
        board visibly smoother. The mark is a glyph, so it is drawn like the
        other glyphs — geometry, no font, one `<use>` per node.
      */}
      <symbol id="mg-flag" viewBox="0 0 24 24">
        <circle
          cx="12"
          cy="12"
          r="10.6"
          fill="#eab308"
          stroke="#0b0f17"
          strokeWidth="2"
        />
        {/* The bang: a tapered bar and its dot, as plain fills. */}
        <path fill="#0b0f17" d="M10.5 5.2h3l-0.55 9h-1.9z" />
        <circle cx="12" cy="17.4" r="1.55" fill="#0b0f17" />
      </symbol>
      {/* buff — matches BUFF_ICONS in components/buff-icon.tsx */}
      <symbol id="mg-buffAtk" viewBox="0 0 24 24">
        {/* swords */}
        <polyline {...stroke} points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
        <line {...stroke} x1="13" x2="19" y1="19" y2="13" />
        <line {...stroke} x1="16" x2="20" y1="16" y2="20" />
        <line {...stroke} x1="19" x2="21" y1="21" y2="19" />
        <polyline {...stroke} points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
        <line {...stroke} x1="5" x2="9" y1="14" y2="18" />
        <line {...stroke} x1="7" x2="4" y1="17" y2="20" />
        <line {...stroke} x1="3" x2="5" y1="19" y2="21" />
      </symbol>
      <symbol id="mg-buffDef" viewBox="0 0 24 24">
        {/* shield-half */}
        <path
          {...stroke}
          d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        />
        <path {...stroke} d="M12 22V2" />
      </symbol>
      <symbol id="mg-buffHp" viewBox="0 0 24 24">
        {/* heart */}
        <path
          {...stroke}
          d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"
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

/**
 * Sword box relative to the mark radius.
 *
 * Big enough that the blades read as blades over the disc, not as scratches
 * around it — they are strokes, so the kind glyph still shows through between
 * them and the node keeps saying what it is while it burns. Smaller far out,
 * where there is no disc under them and six of these would otherwise be the
 * only thing on the board.
 */
const BATTLE_SPAN = 3.4;
const BATTLE_SPAN_FAR = 2.4;
/** Dashed plan orbit relative to mark radius (close / territory zoom). */
const PLAN_SPAN = 3.6;
const PLAN_SPAN_FAR = 2.8;

/**
 * Two swords scissoring open and shut over a contested node.
 *
 * A nested `<svg>` rather than a `<g>`: it establishes its own viewport, so
 * the CSS `transform-origin` in `globals.css` can be written as plain units
 * of this 24×24 box and still land on the guard for every node at every zoom.
 * A `<g>` would resolve the same origin against the whole map's coordinate
 * system, and every node would swing around the middle of the board.
 *
 * Drawn *under* the disc on purpose: the blades read as sticking out past the
 * node while the glyph inside it stays legible, so "what is this place" and
 * "it is being fought over" are both answerable at a glance.
 */
const SWORD_D = "M12 3.5V13.5M8.6 13.5h6.8M12 13.5v5M12 20.2h.01";

/**
 * How far each sword stands off the centre, in units of the 24-wide box.
 *
 * They used to pivot about the same point, so their guards sat exactly on top
 * of each other and the crossing was a single red lump. Standing them apart
 * moves the crossing off the pivot, and each one turns about its own middle.
 * The offset runs *against* the swing — the blade that sweeps left starts on
 * the right — otherwise they part into a V instead of crossing.
 */
const SWORD_OFFSET = 24 * 0.15;

/** One sword: dark casing and the blade over it, as a single animated unit. */
function Sword({ variant, dx }: { variant: "a" | "b"; dx: number }) {
  const blade = {
    d: SWORD_D,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <g transform={`translate(${dx} 0)`}>
      {/*
        Casing and colour animate as one group, never as two synchronised
        ones: two animations started a frame apart would drift, and the
        casing would slide out from under its own blade.
      */}
      <g className={`wz-sword wz-sword-${variant}`}>
        <path {...blade} stroke="#0b0f17" strokeWidth={5} strokeOpacity={0.9} />
        <path {...blade} stroke={BATTLE_COLOR} strokeWidth={2} />
      </g>
    </g>
  );
}

function BattleMark({ size }: { size: number }) {
  return (
    <svg
      className="wz-map-deco"
      x={-size / 2}
      y={-size / 2}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      overflow="visible"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      {/*
        Whole swords in sequence, not all the casings and then all the blades:
        the second sword's casing lands on top of the first one's blade, and
        that dark line is what keeps the crossing from reading as one shape.
      */}
      <Sword variant="a" dx={SWORD_OFFSET} />
      <Sword variant="b" dx={-SWORD_OFFSET} />
    </svg>
  );
}

/**
 * Planned capture stage around a node: soft breathing halo + dashed ring that
 * crawls slowly. Nested viewBox so spin stays centred on the node — same trick
 * as BattleMark (CSS transform on a local SVG, not the whole board).
 */
function PlanMark({ size }: { size: number }) {
  return (
    <svg
      className="wz-map-deco"
      x={-size / 2}
      y={-size / 2}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      overflow="visible"
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      {/* Opacity breathe — more reliable on SVG than animating stroke colour. */}
      <circle
        cx="24"
        cy="24"
        r="21"
        fill="none"
        stroke="#e8edf5"
        strokeWidth="1.5"
        className="wz-plan-halo"
      />
      <g className="wz-plan-spin">
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke="#d0d7e4"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeDasharray="3.5 5.2"
          className="wz-plan-ring"
        />
      </g>
    </svg>
  );
}

/** Sticky-note cloud over a war-room node (count badge when several). */
function NoteCloud({
  size,
  count,
  k,
  markR,
}: {
  size: number;
  count: number;
  k: number;
  markR: number;
}) {
  const y = -markR - size * 0.55;
  return (
    <g
      className="wz-map-deco"
      transform={`translate(0 ${y})`}
      style={{ pointerEvents: "none" }}
      aria-hidden
    >
      <ellipse
        cx={0}
        cy={0}
        rx={size * 0.55}
        ry={size * 0.38}
        fill="#f8fafc"
        stroke="#94a3b8"
        strokeWidth={1.2 * k}
        opacity={0.95}
      />
      <ellipse
        cx={-size * 0.18}
        cy={size * 0.22}
        rx={size * 0.14}
        ry={size * 0.1}
        fill="#f8fafc"
        stroke="#94a3b8"
        strokeWidth={0.9 * k}
      />
      <text
        y={size * 0.12}
        textAnchor="middle"
        fontSize={Math.max(9 * k, size * 0.45)}
        fontWeight="700"
        fill="#0b0f17"
      >
        {count > 9 ? "9+" : count > 1 ? String(count) : "…"}
      </text>
    </g>
  );
}

/** Seconds of delay per hop so the light front expands from our border outward. */
const PLAN_FLOW_STAGGER_S = 0.45;

/**
 * Shared capture-plan roads: soft white–grey base + a bright packet crawling
 * a → b. Drawn above the ordinary graph and under node marks so the wave
 * tucks under discs at the tips.
 */
function PlanEdgesLayer({
  segs,
  byId,
  k,
}: {
  segs: PlanEdgeSeg[];
  byId: Map<number, Pt>;
  /** World units per CSS px — stroke width in map space so we skip non-scaling-stroke. */
  k: number;
}) {
  if (segs.length === 0) return null;
  return (
    <g className="wz-plan-roads" style={{ pointerEvents: "none" }} aria-hidden>
      {segs.map((seg) => {
        const a = byId.get(seg.aId);
        const b = byId.get(seg.bId);
        if (!a || !b) return null;
        const delay = `${(seg.hop ?? 0) * PLAN_FLOW_STAGGER_S}s`;
        return (
          <g key={`plan-${seg.aId}-${seg.bId}`}>
            <line
              x1={a.px}
              y1={a.py}
              x2={b.px}
              y2={b.py}
              className="wz-plan-edge"
              strokeWidth={3.4 * k}
            />
            <line
              x1={a.px}
              y1={a.py}
              x2={b.px}
              y2={b.py}
              className="wz-plan-flow wz-map-deco"
              pathLength={1}
              strokeWidth={4.2 * k}
              style={{ animationDelay: delay }}
            />
          </g>
        );
      })}
    </g>
  );
}

/** How far a held node stains the ground around it, in map units. */
const ZONE_UNITS = 64;

/**
 * Who holds the board, drawn as ground rather than as marks.
 *
 * One `<g>` per kingdom, and the *group* carries the alpha while the discs
 * inside it stay opaque. That is the whole trick: overlapping discs union
 * into a single region before the group is faded, so a cluster of ten cities
 * reads as one province instead of ten ever-darker circles stacked up. A
 * wider, fainter pass underneath softens the scalloped edge into a border.
 *
 * The radius is in map units, so a province is a fact about the ground: it
 * keeps its shape while you pan and zoom instead of breathing with the
 * camera. No filters — a blur over the whole board re-rasterises on every
 * frame of a pinch, and this has to stay smooth on a phone.
 */
function TerritoryLayer({ groups }: { groups: [string, Pt[]][] }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {groups.map(([color, members]) => (
        <g key={`halo-${color}`} opacity={0.14}>
          {members.map(({ node, px, py }) => (
            <circle
              key={node.id}
              cx={px}
              cy={py}
              r={ZONE_UNITS * 1.35}
              fill={color}
            />
          ))}
        </g>
      ))}
      {groups.map(([color, members]) => (
        <g key={color} opacity={0.32}>
          {members.map(({ node, px, py }) => (
            <circle key={node.id} cx={px} cy={py} r={ZONE_UNITS} fill={color} />
          ))}
        </g>
      ))}
    </g>
  );
}

/**
 * Roads, as their own memoised layer.
 *
 * Pan is the gesture this exists for. Panning does not change `k`, so a
 * pan-end commit leaves every prop here identical and React walks past 352
 * lines instead of rebuilding them — which is most of what used to make the
 * map hitch the instant a finger came off it.
 */
const EdgesLayer = memo(function EdgesLayer({
  edges,
  byId,
  k,
  selectedId,
  onEdgeTap,
  band,
}: {
  edges: EdgeRow[];
  byId: Map<number, Pt>;
  k: number;
  selectedId: number | null;
  onEdgeTap: ((edge: EdgeRow) => void) | null;
  /** Render region, or null for "draw the whole board". */
  band: View | null;
}) {
  return (
    <g>
      {edges.map((edge) => {
        const a = byId.get(edge.aId);
        const b = byId.get(edge.bId);
        if (!a || !b) return null;
        // By the segment's own box, not by its endpoints: a long road can have
        // both ends off-screen and still cross the middle of the view.
        if (
          band &&
          (Math.max(a.px, b.px) < band.x ||
            Math.min(a.px, b.px) > band.x + band.w ||
            Math.max(a.py, b.py) < band.y ||
            Math.min(a.py, b.py) > band.y + band.h)
        ) {
          return null;
        }
        const touches = selectedId === edge.aId || selectedId === edge.bId;
        // Stroke in world units (× k ≈ screen px). Avoid non-scaling-stroke
        // under a live CSS transform — it forces extra work on Android GPUs.
        const sw = (touches ? 4.8 : 3) * k;
        return (
          <g key={`${edge.aId}-${edge.bId}`}>
            <line
              x1={a.px}
              y1={a.py}
              x2={b.px}
              y2={b.py}
              stroke={touches ? "#38bdf8" : "#3f4d69"}
              strokeWidth={sw}
              strokeLinecap="round"
            />
            {onEdgeTap && (
              <line
                x1={a.px}
                y1={a.py}
                x2={b.px}
                y2={b.py}
                stroke="transparent"
                strokeWidth={14 * k}
                strokeLinecap="round"
                style={{ cursor: "pointer" }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onEdgeTap(edge);
                }}
              />
            )}
          </g>
        );
      })}
    </g>
  );
});

type MapNodeProps = {
  node: NodeRow;
  px: number;
  py: number;
  s: NodeStyle;
  isSel: boolean;
  mode: MapMode;
  far: boolean;
  k: number;
  boost: number;
  detail: Detail;
  onTap: (id: number) => void;
};

/**
 * For a node the parent has no style for. A module constant, not an inline
 * literal: a fresh object every render would defeat `MapNode`'s memo.
 */
const FALLBACK_STYLE: NodeStyle = { fill: "#64748b" };

/** Fields of a node mark that actually reach the screen. */
function sameStyle(a: NodeStyle, b: NodeStyle): boolean {
  return (
    a.fill === b.fill &&
    a.ring === b.ring &&
    a.outline === b.outline &&
    !!a.flag === !!b.flag &&
    !!a.shield === !!b.shield &&
    !!a.battle === !!b.battle &&
    !!a.plan === !!b.plan &&
    !!a.note === !!b.note &&
    a.noteCount === b.noteCount
  );
}

/**
 * Compare by value, not by identity, and only over what a mark draws.
 *
 * Both of the things that re-render this component hand it fresh objects that
 * mean nothing new: every snapshot pull replaces all 231 `NodeRow`s, and the
 * 5s map clock rebuilds all 231 `NodeStyle`s. Identity comparison would treat
 * both as a full redraw of the board; this treats them as what they are —
 * nothing changed — and the board stays put.
 */
function sameMapNode(a: MapNodeProps, b: MapNodeProps): boolean {
  return (
    a.px === b.px &&
    a.py === b.py &&
    a.isSel === b.isSel &&
    a.mode === b.mode &&
    a.far === b.far &&
    a.k === b.k &&
    a.boost === b.boost &&
    a.detail === b.detail &&
    a.onTap === b.onTap &&
    a.node.id === b.node.id &&
    a.node.kind === b.node.kind &&
    a.node.level === b.node.level &&
    a.node.name === b.node.name &&
    a.node.buffAtk === b.node.buffAtk &&
    a.node.buffDef === b.node.buffDef &&
    a.node.buffHp === b.node.buffHp &&
    sameStyle(a.s, b.s)
  );
}

/** One node mark: disc or bare glyph, plus whatever is happening to it. */
const MapNode = memo(function MapNode({
  node,
  px,
  py,
  s,
  isSel,
  mode,
  far,
  k,
  boost,
  detail,
  onTap,
}: MapNodeProps) {
  const buff = mode === "buff" ? dominantBuff(node) : null;
  // In buff mode a node that grants nothing shrinks out of the way: the whole
  // point of the view is spotting what is worth taking.
  const r =
    MARK_PX[node.kind] * boost * k * (mode === "buff" && !buff ? 0.45 : 1);
  const glyphId =
    mode === "buff"
      ? buff
        ? BUFF_GLYPH_ID[buff.field]
        : null
      : KIND_GLYPH_ID[node.kind];
  const gSize = r * (far ? FAR_GLYPH_RATIO : GLYPH_RATIO);

  return (
    <g
      transform={`translate(${px} ${py})`}
      style={{ cursor: "pointer" }}
      onClick={(ev) => {
        ev.stopPropagation();
        onTap(node.id);
      }}
    >
      {/* A dome up close, a thin collar far out: at territory zoom
          the full-size domes are wider than the gaps between nodes
          and drown the very colour the view exists to show. */}
      {s.shield &&
        (far ? (
          <circle
            r={gSize * 0.72}
            fill="none"
            stroke="#7dd3fc"
            strokeOpacity={0.75}
            strokeWidth={1.4 * k}
          />
        ) : (
          <circle
            r={r * 2.3}
            fill="#38bdf8"
            fillOpacity={0.16}
            stroke="#7dd3fc"
            strokeWidth={1.2 * k}
          />
        ))}
      {isSel && (
        <circle
          r={r * 2.7}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={1.8 * k}
          strokeDasharray={`${3 * k} ${2.5 * k}`}
        />
      )}
      {/* Outline (e.g. link-editor neighbours) must survive far zoom
          when discs are off. */}
      {far && s.outline && (
        <circle
          r={gSize * 0.9}
          fill="none"
          stroke={s.outline}
          strokeWidth={1.8 * k}
          strokeOpacity={0.95}
        />
      )}
      {/* Far out the ground is already the kingdom's colour, so the
          disc and its ring would only repeat it — at the density
          where they overlap into a pile. The glyph alone, half
          faded, still says what the object is. */}
      {!far && s.ring && (
        <circle r={r * 1.55} fill="none" stroke={s.ring} strokeWidth={2 * k} />
      )}
      {!far && (
        // Disc carries the colour, glyph carries the meaning.
        // Plan: soft white overlay that breathes — kingdom fill stays
        // underneath so ownership is still readable.
        <>
          <circle
            r={r}
            fill={s.fill}
            stroke={s.outline ?? "#0b0f17"}
            strokeWidth={1.6 * k}
          />
          {s.plan && (
            <circle
              r={r}
              fill="#e8edf5"
              className="wz-plan-fill"
              style={{ pointerEvents: "none" }}
            />
          )}
        </>
      )}
      {glyphId && (
        <use
          href={glyphId}
          x={-gSize / 2}
          y={-gSize / 2}
          width={gSize}
          height={gSize}
          style={{
            color: far ? FAR_GLYPH_INK : GLYPH_INK,
            opacity: far ? farGlyphOpacity(k) : 1,
            pointerEvents: "none",
          }}
        />
      )}
      {s.plan && <PlanMark size={r * (far ? PLAN_SPAN_FAR : PLAN_SPAN)} />}
      {s.battle && (
        <BattleMark size={r * (far ? BATTLE_SPAN_FAR : BATTLE_SPAN)} />
      )}
      {s.note && (
        <NoteCloud
          size={r * (far ? 1.8 : 2.2)}
          count={s.noteCount ?? 1}
          k={k}
          markR={r}
        />
      )}
      {!far && s.flag && (
        <use
          href="#mg-flag"
          x={r * 1.5 - 5.5 * k}
          y={-r * 1.6 - 5.5 * k}
          width={11 * k}
          height={11 * k}
          style={{ pointerEvents: "none" }}
        />
      )}
      {/* Finger-sized hit area for mouse; touch uses pickNodeAtClient. */}
      <circle r={Math.max(r * 1.6, 22 * k)} fill="transparent" />

      {/* Far out the board is territory, not a list of objects:
          no text at all, the colour under the glyph says it. */}
      {!far &&
        (mode === "buff"
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
                  </>
                ) : (
                  // Zoomed out the name is unreadable anyway; the
                  // level is what you scan the map for.
                  <tspan fontWeight="700" fill="#8fa3bf">
                    {node.level}
                  </tspan>
                )}
              </text>
            ))}
    </g>
  );
}, sameMapNode);

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
  territory = false,
  fitToken = 0,
  focusId = null,
  focusToken = 0,
  planEdges = [],
  onLongPressNode,
  toolbar,
  toolbarEnd,
  status,
  empty,
}: {
  nodes: NodeRow[];
  edges: EdgeRow[];
  rotated: boolean;
  flipY: boolean;
  selectedId: number | null;
  onSelectNode: (id: number) => void;
  /**
   * Hold ~0.5s on a node (touch or right-click). Parent opens a menu; the
   * following click/tap is suppressed so a long-press does not also route.
   */
  onLongPressNode?: (id: number) => void;
  onEdgeClick?: (edge: EdgeRow) => void;
  styleFor: (node: NodeRow) => NodeStyle;
  /** Extra text under the name, e.g. a shield countdown. */
  labelFor?: (node: NodeRow) => string | null;
  /** What the glyphs and labels describe. Defaults to the object itself. */
  mode?: MapMode;
  /**
   * Let the zoomed-out view drop the marks and paint `style.zone` as ground
   * instead. Off for `/links`, where the map is a wiring diagram and every
   * node has to stay a tappable dot at any zoom.
   */
  territory?: boolean;
  /** Bump to re-fit the view from outside. */
  fitToken?: number;
  /**
   * Pan the camera onto this node without changing zoom. Pair with
   * `focusToken` — bump the token when a chip in chat asks the map to show a
   * node; pan re-runs if the panel was still `display:none` (phone tab) when
   * the request arrived.
   */
  focusId?: number | null;
  focusToken?: number;
  /**
   * Directed capture-plan segments (light a → b). Empty on the live map; the
   * war room fills this when officers lay expansion paths.
   */
  planEdges?: PlanEdgeSeg[];
  /** Top-start controls (Fit, 45°, …). */
  toolbar?: React.ReactNode;
  /** Top-end controls (Help, …) — same button style as the start toolbar. */
  toolbarEnd?: React.ReactNode;
  status?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  // The one string this component owns: parents pass `status` / `empty` as
  // nodes, but only the canvas knows when it has finished framing itself.
  const { t } = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cameraRef = useRef<SVGGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [view, setView] = useState<View>({ x: 0, y: 0, w: 100, h: 100 });
  /**
   * The live camera — **not** a mirror of `view`, and never written during
   * render.
   *
   * A pan is DOM-only: `paintCamera` moves the matrix and this ref, and React
   * hears about it once, on pointer-up. Assigning `viewRef.current = view` in
   * the render body used to undo that. Any re-render landing mid-gesture — the
   * 5s map clock, an SSE snapshot, a parent tick — rewound the ref to the last
   * *committed* view, and the `commitView(viewRef.current)` on pointer-up then
   * saved the rewind: the map snapped back to where the drag started. So the
   * ref leads and `view` follows, never the other way round.
   */
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
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

  /**
   * The board has been framed at least once against a real container.
   *
   * Before that, `view` is the initial 100×100 window over a placeholder
   * 900×600 box, so the first paint is a wild zoom onto whatever two nodes
   * happen to sit near the origin — which is exactly the half-second of
   * squashed nonsense you saw on load. Nothing is shown until the first fit
   * has landed.
   */
  const [framed, setFramed] = useState(false);

  /**
   * A canvas can mount inside a hidden tab — the war room puts the board
   * behind one on a phone — where it has no box at all and nothing to frame
   * against. ResizeObserver reports it the moment it is revealed and gains
   * one, which is when the first fit runs and the board is shown.
   */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      if (w < 2 || h < 2) return;
      // Ref first: the gesture handlers read it and must not wait for a commit.
      sizeRef.current = { w, h };
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

  /**
   * The region React last rendered, or null while the whole board is drawn.
   * A ref because `paintCamera` runs on every gesture frame and must not be
   * rebuilt (or go stale) between commits.
   */
  const bandRef = useRef<View | null>(null);
  /** Set from the effect below — `commitView` is defined further down. */
  const commitViewRef = useRef<(v: View) => void>(() => {});

  /** CSS transform on the world group — better GPU path than SVG transform attr. */
  const paintCamera = useCallback((v: View) => {
    viewRef.current = v;
    const g = cameraRef.current;
    if (!g) return;
    const { w: sw, h: sh } = sizeRef.current;
    g.style.transform = cameraCssMatrix(v, sw, sh);

    // Panned or pinched past what is mounted — pull the next ring in now,
    // while it is still outside the screen, rather than after a gap shows.
    //
    // Synchronously, not via rAF. This runs inside the pointer/wheel handler,
    // so React renders before the browser paints this frame; deferring it by
    // one rAF was enough for a hard zoom-out (view growing 1.18× per frame) to
    // outrun the mounted ring and blink a couple of nodes at the edge. No
    // throttle needed: the first commit re-centres the band, so any further
    // call in the same frame no longer breaches it.
    const band = bandRef.current;
    if (band && !bandHolds(band, v)) {
      // Keep the ref in step immediately — the effect that normally maintains
      // it runs after commit, and a second breach test can happen before then.
      bandRef.current = bandFor(v);
      commitViewRef.current(v);
    }
  }, []);

  /**
   * While the finger moves: hide animated decorations (see globals.css) and
   * skip React. Attribute only — no setState mid-gesture.
   */
  const setCameraBusy = useCallback((busy: boolean) => {
    const svg = svgRef.current;
    if (!svg) return;
    if (busy) svg.setAttribute("data-panning", "1");
    else svg.removeAttribute("data-panning");
  }, []);

  const wheelIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Commit camera to React (cull + mark sizes / LOD). */
  const commitView = useCallback((v: View) => {
    viewRef.current = v;
    detailRef.current = detailOf(v, sizeRef.current.w);
    const g = cameraRef.current;
    if (g) {
      const { w: sw, h: sh } = sizeRef.current;
      g.style.transform = cameraCssMatrix(v, sw, sh);
    }
    setView(v);
  }, []);

  useEffect(() => {
    commitViewRef.current = commitView;
  }, [commitView]);

  /**
   * Zoom/pinch: matrix only. React (cull + LOD) waits for the gesture to end —
   * mid-pinch rebuilds were a big part of the remaining map flicker on phones.
   */
  const scheduleZoomView = useCallback(
    (v: View) => {
      paintCamera(v);
    },
    [paintCamera],
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
    // Only a fit against a measured container counts as framed; the first one
    // runs on the placeholder size and is the frame we are hiding.
    if (measured) setFramed(true);
  }, [fitKey, fit, measured]);

  /**
   * Chat chips (and any other external "look at this node") pan here. Keep the
   * current zoom: the officer already framed the front they care about; they
   * only need the camera to land on the pin. Re-runs when the panel becomes
   * measurable (phone tab was `display:none` when the chip was tapped).
   */
  const lastFocus = useRef(0);
  useEffect(() => {
    if (!focusToken || focusId == null) return;
    if (size.w < 2 || size.h < 2) return;
    if (lastFocus.current === focusToken) return;
    const p = ptsRef.current.find((pt) => pt.node.id === focusId);
    if (!p) return;
    lastFocus.current = focusToken;
    const v = viewRef.current;
    commitView({
      x: p.px - v.w / 2,
      y: p.py - v.h / 2,
      w: v.w,
      h: v.h,
    });
  }, [focusToken, focusId, size.w, size.h, commitView]);

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
      setCameraBusy(true);
      if (wheelIdleRef.current != null) clearTimeout(wheelIdleRef.current);
      wheelIdleRef.current = setTimeout(() => {
        wheelIdleRef.current = null;
        setCameraBusy(false);
        // Apply final k (mark sizes / LOD) after the wheel burst settles.
        commitView(viewRef.current);
      }, 160);
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
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelIdleRef.current != null) clearTimeout(wheelIdleRef.current);
    };
  }, [scheduleZoomView, setCameraBusy, commitView]);

  // Keep camera CSS transform in sync after React commits (size / view change).
  // Painted from the *ref*, not from `view`: this effect can also fire in the
  // middle of a drag, and the committed view is a stale camera by then.
  useEffect(() => {
    const g = cameraRef.current;
    if (!g) return;
    const { w: sw, h: sh } = sizeRef.current;
    g.style.transform = cameraCssMatrix(viewRef.current, sw, sh);
    g.style.transformOrigin = "0px 0px";
  }, [view, size.w, size.h]);

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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  /** Swallow the click that follows a successful long-press / context menu. */
  const suppressClick = useRef(false);

  function clearLongPress() {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function fireLongPress(id: number) {
    if (!onLongPressNode) return;
    longPressFired.current = true;
    suppressClick.current = true;
    moved.current = true;
    drag.current = null;
    onLongPressNode(id);
  }

  function localFromClient(clientX: number, clientY: number) {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function capture(e: React.PointerEvent) {
    const el = e.currentTarget as Element;
    if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
  }

  function findNodeAtClient(clientX: number, clientY: number): number | null {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return null;
    const v = viewRef.current;
    const sw = sizeRef.current.w;
    const sh = sizeRef.current.h;
    // Client → screen SVG (fixed 0..sw / 0..sh viewBox) → world.
    const screenX = ((clientX - rect.left) / rect.width) * sw;
    const screenY = ((clientY - rect.top) / rect.height) * sh;
    const mx = (screenX / sw) * v.w + v.x;
    const my = (screenY / sh) * v.h + v.y;
    const k = v.w / Math.max(sw, 1);
    const boost = markBoost(k);
    let best: { id: number; d2: number } | null = null;
    for (const { node, px, py } of ptsRef.current) {
      const r = MARK_PX[node.kind] * boost * k * 1.6;
      const ddx = mx - px;
      const ddy = my - py;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 <= r * r && (!best || d2 < best.d2)) {
        best = { id: node.id, d2 };
      }
    }
    return best?.id ?? null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longPressFired.current = false;
    clearLongPress();
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
      clearLongPress();
      setCameraBusy(true);
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

      if (onLongPressNode) {
        const hitId = findNodeAtClient(e.clientX, e.clientY);
        if (hitId != null) {
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            if (moved.current) return;
            // Hold still — open menu, cancel pan / short-tap routing.
            fireLongPress(hitId);
          }, 480);
        }
      }
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
      clearLongPress();
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
      if (!moved.current) setCameraBusy(true);
      moved.current = true;
      clearLongPress();
      // Mouse: capture only once it's clearly a drag (keeps node clicks working).
      if (d.pointerType === "mouse") capture(e);
    }
    if (!moved.current) return;
    const v = viewRef.current;
    // Pan only: one camera matrix on the world group — not viewBox thrashing.
    paintCamera({
      ...v,
      x: d.vx - (dx * v.w) / sw,
      y: d.vy - (dy * v.h) / sh,
    });
  }

  /**
   * Stable across renders on purpose: `MapNode` / `EdgesLayer` are memoised,
   * and a fresh closure here would invalidate all 231 marks on every commit —
   * exactly the rebuild the memo exists to avoid. The gesture state it reads
   * lives in refs, so nothing has to be captured.
   */
  const onNodeTap = useCallback(
    (id: number) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      if (moved.current) return;
      onSelectNode(id);
    },
    [onSelectNode],
  );

  const onEdgeTap = useMemo(
    () =>
      onEdgeClick
        ? (edge: EdgeRow) => {
            if (moved.current) return;
            onEdgeClick(edge);
          }
        : null,
    [onEdgeClick],
  );

  function pickNodeAtClient(clientX: number, clientY: number) {
    // Touch capture steals the synthetic click target; hit-test nodes ourselves.
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const id = findNodeAtClient(clientX, clientY);
    if (id != null) onSelectNode(id);
  }

  function onContextMenu(e: React.MouseEvent) {
    if (!onLongPressNode) return;
    const id = findNodeAtClient(e.clientX, e.clientY);
    if (id == null) return;
    e.preventDefault();
    clearLongPress();
    fireLongPress(id);
  }

  function onPointerUp(e: React.PointerEvent) {
    clearLongPress();
    const skipTap = longPressFired.current;
    longPressFired.current = false;
    const wasTap =
      !skipTap &&
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
      setCameraBusy(false);
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
      setCameraBusy(false);
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

  const boost = markBoost(k);
  /** Zoomed out past the point where discs can fit: paint ground, not marks. */
  const far = territory && k >= TERRITORY_FROM;

  /**
   * What to draw: the viewport plus a margin, or the whole board.
   *
   * Whole board in the territory view — there the board *is* the viewport, so
   * culling saves nothing, and each held node stains the ground for 64 units
   * around it, so a node well off-screen still colours what you can see.
   *
   * Everywhere else this is the difference the phone feels. Zoomed in far
   * enough to read the glyphs, around 30 of the 231 marks are on screen; the
   * other 200 were being built, laid out and re-laid-out on every commit for
   * nobody. That is also why clearing the "!" flags was so noticeable: each
   * flagged node added a group, a circle and an SVG `<text>`, and text is the
   * most expensive thing on this canvas — 231 of them, nearly all off-screen.
   */
  const band = useMemo(() => (far ? null : bandFor(view)), [far, view]);

  // After commit, not during render: the ref means "this is what is mounted",
  // and a render React throws away must not be able to claim otherwise.
  useEffect(() => {
    bandRef.current = band;
  }, [band]);

  const shown = useMemo(() => {
    if (!band) return pts;
    const pad = CULL_PAD_PX * k;
    const x0 = band.x - pad;
    const x1 = band.x + band.w + pad;
    const y0 = band.y - pad;
    const y1 = band.y + band.h + pad;
    return pts.filter(
      (p) => p.px >= x0 && p.px <= x1 && p.py >= y0 && p.py <= y1,
    );
  }, [pts, band, k]);

  // Only for what is actually drawn — `styleFor` runs per node and the
  // territory view, the one case that needs every node, never culls.
  const styles = useMemo(() => {
    const m = new Map<number, NodeStyle>();
    for (const { node } of shown) m.set(node.id, styleFor(node));
    return m;
  }, [shown, styleFor]);

  // Held nodes bucketed by colour — one province per kingdom, not per node.
  // Only the territory view draws these, so building them at any other zoom
  // is a pass over the whole board for something nobody renders.
  const zoneGroups = useMemo<[string, Pt[]][]>(() => {
    if (!far) return [];
    const m = new Map<string, Pt[]>();
    for (const p of shown) {
      const zone = styles.get(p.node.id)?.zone;
      if (!zone) continue;
      const bucket = m.get(zone);
      if (bucket) bucket.push(p);
      else m.set(zone, [p]);
    }
    return [...m];
  }, [shown, styles, far]);

  /**
   * Shield countdowns, resolved here rather than in the node loop so they can
   * be drawn as a top layer. The label sits under whatever text the node
   * already carries — a name at full detail, a level otherwise — and the
   * offset is the same either way because both are one line at 13 px.
   */
  const shieldLabels = useMemo(() => {
    if (far || mode === "buff" || !labelFor || k >= SHIELD_UNTIL) return [];
    const out: { id: number; px: number; py: number; text: string }[] = [];
    for (const { node, px, py } of shown) {
      const text = labelFor(node);
      if (!text) continue;
      const r = MARK_PX[node.kind] * boost * k;
      out.push({ id: node.id, px, py: py + r + 29 * k, text });
    }
    return out;
  }, [shown, labelFor, far, mode, k, boost]);

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
        style={{
          touchAction: "none",
          // Hidden, not unmounted: the ResizeObserver measures this very
          // wrapper, so the board has to be laid out to know how to frame it.
          opacity: framed ? 1 : 0,
        }}
        viewBox={screenViewBoxAttr(size.w, size.h)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
      >
        <MapGlyphDefs />

        {/*
          World layer: pan/zoom = this matrix only. Fixed viewBox above is
          screen pixels; children stay in map coordinates.
        */}
        <g
          ref={cameraRef}
          className="wz-map-camera"
          style={{
            transform: cameraCssMatrix(view, size.w, size.h),
            transformOrigin: "0px 0px",
          }}
        >
        {far && <TerritoryLayer groups={zoneGroups} />}

        <EdgesLayer
          edges={edges}
          byId={byId}
          k={k}
          selectedId={selectedId}
          onEdgeTap={onEdgeTap}
          band={band}
        />

        {/* Expansion plan: base path + light wave toward tips, under marks. */}
        <PlanEdgesLayer segs={planEdges} byId={byId} k={k} />

        <g>
          {shown.map(({ node, px, py }) => (
            <MapNode
              key={node.id}
              node={node}
              px={px}
              py={py}
              s={styles.get(node.id) ?? FALLBACK_STYLE}
              isSel={selectedId === node.id}
              mode={mode}
              far={far}
              k={k}
              boost={boost}
              detail={detail}
              onTap={onNodeTap}
            />
          ))}
        </g>

        {/*
          Countdowns are a layer of their own, drawn after every node, and
          that is the whole reason they exist outside the node group: SVG
          paints in document order, so a label living inside its own node was
          free to be covered by any node that came later. A shield timer that
          a neighbouring disc half-hides is worse than no timer — it is the
          one number on this screen you act on. Up here nothing can be on top
          of it, and the dark casing carries it over whatever it crosses.
        */}
        {shieldLabels.length > 0 && (
          <g style={{ pointerEvents: "none" }}>
            {shieldLabels.map(({ id, px, py, text }) => (
              <text
                key={id}
                x={px}
                y={py}
                textAnchor="middle"
                fontSize={12 * k}
                fontWeight="700"
                fill="#7dd3fc"
                stroke="#0b0f17"
                strokeWidth={2.6 * k}
                paintOrder="stroke"
                strokeLinejoin="round"
              >
                {text}
              </text>
            ))}
          </g>
        )}
        </g>
      </svg>

      {toolbar && (
        <div className="absolute start-2 top-2 z-10 flex flex-wrap gap-1.5">
          {toolbar}
        </div>
      )}

      {toolbarEnd && (
        <div className="absolute end-2 top-2 z-10 flex flex-wrap justify-end gap-1.5">
          {toolbarEnd}
        </div>
      )}

      {status && (
        <div className="pointer-events-none absolute bottom-2 start-2 end-2 flex justify-center">
          <div className="pointer-events-auto max-w-full rounded-lg border bg-[var(--color-panel)]/95 px-3 py-2 text-xs backdrop-blur">
            {status}
          </div>
        </div>
      )}

      {!framed && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <span
            className="wz-spinner block size-9"
            style={{ ["--wz-spinner-w" as string]: "3.5px" }}
            aria-hidden
          />
          <span className="text-xs text-[var(--color-text-soft)]">
            {t("map.loading")}
          </span>
        </div>
      )}

      {framed && nodes.length === 0 && empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {empty}
        </div>
      )}
    </div>
  );
}

/** Skip re-renders when the parent only re-ticks for the side panel clock. */
export const MapCanvas = memo(MapCanvasImpl);
