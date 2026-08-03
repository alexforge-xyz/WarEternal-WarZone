"use client";

import { useEffect, useState } from "react";

/**
 * A once-per-second clock in unix seconds, corrected by the server's own
 * timestamp so a phone with a drifting clock still counts shields down to the
 * same instant as everyone else.
 *
 * It starts at `serverNow`, which is what the server rendered, so hydration
 * matches before the first tick.
 */
export function useClock(serverNow: number): number {
  const [offset] = useState(() => Math.floor(Date.now() / 1000) - serverNow);
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000) - offset);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offset]);

  return now;
}
