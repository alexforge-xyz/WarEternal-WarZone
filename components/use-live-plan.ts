"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveEvent } from "@/lib/live-events";
import type { PlanSnapshot } from "@/lib/plan-types";
import { subscribeLive } from "./live-connection";

/**
 * Shared capture plan for the war room. Mutators often return the new
 * snapshot; SSE `plan.changed` is the fan-out for other tabs.
 */
export function useLivePlan(initial: PlanSnapshot): {
  plan: PlanSnapshot;
  setPlan: (plan: PlanSnapshot) => void;
  refresh: () => Promise<void>;
} {
  const [plan, setPlan] = useState(initial);
  const mountedRef = useRef(true);
  const pullingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (pullingRef.current) return;
    pullingRef.current = true;
    try {
      const res = await fetch("/api/plan", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as PlanSnapshot;
      if (mountedRef.current) setPlan(body);
    } catch {
      /* offline blip */
    } finally {
      pullingRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setPlan(initial);
  }, [initial]);

  const onEvent = useCallback(
    (event: LiveEvent) => {
      if (event.type === "plan.changed") void refresh();
    },
    [refresh],
  );

  useEffect(() => {
    const unsub = subscribeLive(onEvent);
    return () => unsub();
  }, [onEvent]);

  return { plan, setPlan, refresh };
}
