"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, LiveEvent } from "@/lib/live-events";
import { subscribeLive } from "./live-connection";

/**
 * How many lines a single open tab keeps. The server only rehydrates the last
 * page on load; this is the ceiling for a night-long session so a forgotten
 * tab does not grow without bound in RAM.
 */
const MAX_HELD = 200;

/**
 * A typing pulse is sticky for this long after the last `active: true`. Longer
 * than the client's re-pulse interval so a slow network does not flicker the
 * line; short enough that a closed tab does not leave a ghost for minutes.
 */
const TYPING_STALE_MS = 4_000;

type Typer = { userId: number; nick: string; until: number };

/**
 * The officer room, kept in sync while the tab is open.
 *
 * Chat lines arrive whole over the shared SSE socket. What the stream cannot
 * promise is *completeness* — a sleeping phone misses frames — so every
 * reconnect asks `/api/chat?after=<last id>` for the gap. That is why the list
 * is keyed by id and merged rather than appended blindly: the same message can
 * arrive twice, once pushed and once caught up.
 */
export function useLiveChat(
  initial: ChatMessage[],
  /** Own account — typing pulses from this id are ignored (no "you are typing"). */
  selfUserId: number,
): {
  messages: ChatMessage[];
  /** Show a line this tab just sent, before it comes back over the socket. */
  append: (message: ChatMessage) => void;
  /** Other officers currently composing, oldest pulse first. */
  typingNicks: string[];
  live: boolean;
} {
  const [messages, setMessages] = useState(initial);
  const [live, setLive] = useState(false);
  const [typingNicks, setTypingNicks] = useState<string[]>([]);

  const lastIdRef = useRef(initial.length ? initial[initial.length - 1].id : 0);
  const mountedRef = useRef(true);
  const catchingRef = useRef(false);
  const typersRef = useRef<Map<number, Typer>>(new Map());
  const selfIdRef = useRef(selfUserId);
  selfIdRef.current = selfUserId;

  const publishTypers = useCallback(() => {
    const now = Date.now();
    const map = typersRef.current;
    for (const [id, t] of map) {
      if (t.until <= now) map.delete(id);
    }
    setTypingNicks([...map.values()].map((t) => t.nick));
  }, []);

  const setTyper = useCallback(
    (userId: number, nick: string, active: boolean) => {
      if (userId === selfIdRef.current) return;
      if (active) {
        typersRef.current.set(userId, {
          userId,
          nick,
          until: Date.now() + TYPING_STALE_MS,
        });
      } else {
        typersRef.current.delete(userId);
      }
      publishTypers();
    },
    [publishTypers],
  );

  const clearTyperByNick = useCallback(
    (nick: string) => {
      for (const [id, t] of typersRef.current) {
        if (t.nick === nick) typersRef.current.delete(id);
      }
      publishTypers();
    },
    [publishTypers],
  );

  const append = useCallback(
    (message: ChatMessage) => {
      // A sent line means they are no longer composing.
      clearTyperByNick(message.nick);
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        if (message.id > lastIdRef.current) lastIdRef.current = message.id;
        // Ids are monotonic, so a push is almost always a plain append; the sort
        // only matters when a catch-up and a push cross paths.
        const next = [...prev, message];
        next.sort((a, b) => a.id - b.id);
        return next.length > MAX_HELD ? next.slice(next.length - MAX_HELD) : next;
      });
    },
    [clearTyperByNick],
  );

  const catchUp = useCallback(async () => {
    if (catchingRef.current) return;
    catchingRef.current = true;
    try {
      const res = await fetch(`/api/chat?after=${lastIdRef.current}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { messages: ChatMessage[] };
      if (!mountedRef.current) return;
      for (const m of body.messages) append(m);
    } catch {
      /* offline blip — the next reconnect asks again */
    } finally {
      catchingRef.current = false;
    }
  }, [append]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Drop stale typers even when the bus is quiet (they closed the tab mid-type).
  useEffect(() => {
    const id = setInterval(publishTypers, 1_000);
    return () => clearInterval(id);
  }, [publishTypers]);

  const onEvent = useCallback(
    (event: LiveEvent) => {
      if (event.type === "chat.message") append(event.message);
      if (event.type === "chat.typing") {
        setTyper(event.userId, event.nick, event.active);
      }
    },
    [append, setTyper],
  );

  useEffect(() => {
    const unsub = subscribeLive(onEvent, (v) => {
      if (!mountedRef.current) return;
      setLive(v);
      // Freshly connected — whatever happened while we were away is missing.
      if (v) void catchUp();
    });

    const onVis = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      unsub();
      setLive(false);
    };
  }, [onEvent, catchUp]);

  return { messages, append, typingNicks, live };
}
