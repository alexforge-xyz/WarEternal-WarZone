import type { Locale } from "@/lib/i18n";

/**
 * A flag per interface language, drawn here as plain shapes.
 *
 * Not emoji: `🇷🇺` and friends are regional-indicator pairs, and Windows has
 * no glyph for them — every desktop visitor would get the bare letters "RU"
 * where the flag should be. Not an image either; this project ships no binary
 * assets. Three rectangles' worth of SVG costs nothing and looks the same
 * everywhere.
 *
 * Arabic has no country of its own; it flies the UAE flag here by choice.
 * Four plain bands, which is also why it survives being 20 px wide — the
 * alternatives carry script, and an approximation of scripture at this size
 * would be worse than not drawing it.
 */

const W = 24;
const H = 16;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/*
        Hairline, and a pale one: the chrome behind these is dark, so the
        band that needs an edge is the black one at the foot of the UAE flag,
        not the white ones. A light stroke gives every flag the same border
        and costs nothing over the pale fields, which already stand out.
      */}
      <rect
        x={0.5}
        y={0.5}
        width={W - 1}
        height={H - 1}
        rx={2}
        fill="none"
        stroke="#e6ebf5"
        strokeOpacity={0.35}
      />
    </>
  );
}

function Ru() {
  return (
    <Frame>
      <rect width={W} height={H} rx={2} fill="#ffffff" />
      <path d={`M0 ${H / 3}h${W}v${H / 3}H0z`} fill="#0039a6" />
      <path d={`M0 ${(H * 2) / 3}h${W}v${H / 3}H0z`} fill="#d52b1e" />
    </Frame>
  );
}

function En() {
  return (
    <Frame>
      <clipPath id="flag-en-clip">
        <rect width={W} height={H} rx={2} />
      </clipPath>
      <g clipPath="url(#flag-en-clip)">
        <rect width={W} height={H} fill="#012169" />
        {/* Saltire: white first, red laid narrower on top. */}
        <path
          d={`M0 0L${W} ${H}M${W} 0L0 ${H}`}
          stroke="#ffffff"
          strokeWidth={3.6}
        />
        <path
          d={`M0 0L${W} ${H}M${W} 0L0 ${H}`}
          stroke="#c8102e"
          strokeWidth={1.4}
        />
        {/* Cross of St George, same order. */}
        <path
          d={`M${W / 2} 0v${H}M0 ${H / 2}h${W}`}
          stroke="#ffffff"
          strokeWidth={5.6}
        />
        <path
          d={`M${W / 2} 0v${H}M0 ${H / 2}h${W}`}
          stroke="#c8102e"
          strokeWidth={3.2}
        />
      </g>
    </Frame>
  );
}

function Ar() {
  // Red bar on the hoist, then green / white / black across. The hoist stays
  // on the left even in Arabic: a flag is an emblem, not text, and mirroring
  // it with the layout would just make it the wrong flag.
  const bar = W / 4;
  const band = H / 3;
  return (
    <Frame>
      <clipPath id="flag-ar-clip">
        <rect width={W} height={H} rx={2} />
      </clipPath>
      <g clipPath="url(#flag-ar-clip)">
        <rect width={W} height={band} x={bar} fill="#00732f" />
        <rect width={W} height={band} x={bar} y={band} fill="#ffffff" />
        <rect width={W} height={band} x={bar} y={band * 2} fill="#000000" />
        <rect width={bar} height={H} fill="#ff0000" />
      </g>
    </Frame>
  );
}

const FLAGS: Record<Locale, () => React.JSX.Element> = {
  en: En,
  ru: Ru,
  ar: Ar,
};

export function LocaleFlag({
  locale,
  size = 20,
  className,
}: {
  locale: Locale;
  size?: number;
  className?: string;
}) {
  const Flag = FLAGS[locale];
  return (
    <svg
      width={size}
      height={(size * H) / W}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      aria-hidden
    >
      <Flag />
    </svg>
  );
}
