"use client";

import { useEffect, useState } from "react";

/**
 * A ticking clock in unix seconds, corrected by the server's own timestamp so a
 * phone with a drifting clock still counts shields down to the same instant as
 * everyone else.
 *
 * It starts at `serverNow`, which is what the server rendered, so hydration
 * matches before the first tick.
 *
 * `intervalMs` defaults to 1s for countdowns. Pass a coarser interval (or
 * derive a stepped value from a 1s clock) for heavy consumers like the map.
 */
export function useClock(serverNow: number, intervalMs = 1000): number {
  const [offset] = useState(() => Math.floor(Date.now() / 1000) - serverNow);
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000) - offset);
    tick();
    const id = setInterval(tick, Math.max(250, intervalMs));
    return () => clearInterval(id);
  }, [offset, intervalMs]);

  return now;
}
