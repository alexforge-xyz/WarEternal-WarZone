/**
 * WarZone mark: the throne node, and the roads running out of it.
 *
 * The map's own vocabulary rather than a new picture — a crowned disc is
 * exactly how the board draws the main castle at the centre, and the two
 * curves leaving it are roads reaching for the nodes it connects to. It has to
 * survive a 16px browser tab, so it is four shapes and no detail: disc, crown,
 * two roads, two node dots.
 *
 * Kept as a component (not an <img>) so it inherits `currentColor` for the
 * roads and can sit in the header at text weight, while the crown keeps the
 * accent blue that the rest of the chrome uses for "yours".
 */
export function Logo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* Roads: out to the north-east and south-west, the way the board's
          45° projection runs. Drawn first so the disc caps them cleanly. */}
      <path
        d="M20.5 12.5C24 9.5 25.5 8 27.5 6.5"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M11.5 19.5C8 22.5 6.5 24 4.5 25.5"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* The nodes those roads reach. */}
      <circle cx="28.4" cy="5.6" r="3" fill="currentColor" fillOpacity="0.55" />
      <circle cx="3.6" cy="26.4" r="3" fill="currentColor" fillOpacity="0.55" />

      {/* The throne itself. */}
      <circle cx="16" cy="16" r="9.5" fill="#38bdf8" />
      <circle
        cx="16"
        cy="16"
        r="9.5"
        stroke="#0b0f17"
        strokeOpacity="0.9"
        strokeWidth="1.6"
      />
      {/* Crown — the same shape the map uses for the central castle, cut down
          to what still reads at tab size: three points and a base. */}
      <path
        d="M11 18.6 9.9 12.2l3.5 2.6L16 10.9l2.6 3.9 3.5-2.6-1.1 6.4z"
        fill="#0b0f17"
      />
      <path
        d="M11.4 20.4h9.2"
        stroke="#0b0f17"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
