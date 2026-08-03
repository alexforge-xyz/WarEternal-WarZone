"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MapPin, Send, X } from "lucide-react";
import { reportTyping, sendMessage } from "@/app/actions/chat";
import type { NodeRow } from "@/db/schema";
import type { ChatMessage } from "@/lib/live-events";
import {
  numberLocale,
  type Locale,
  type MessageKey,
  type Params,
} from "@/lib/i18n";
import { useT } from "./i18n-provider";

/**
 * Re-announce "still typing" at most this often. Keeps SSE quiet while someone
 * hammers the keyboard; pairs with the receiver's 4s stale window.
 */
const TYPING_PULSE_MS = 2_000;
/** After this idle time, broadcast stopped. */
const TYPING_IDLE_MS = 2_500;

/**
 * The talking half of the war room.
 *
 * The one thing it does beyond being a chat: a line can be pinned to a node.
 * Officers plan in sentences ("берём вот этот"), and without the pin that
 * sentence is unreadable an hour later — which node was "вот этот"? So the
 * selected node rides along with the message and comes back as a chip that
 * puts the map back on it.
 */
export function WarRoomChat({
  messages,
  onSent,
  nodeById,
  selectedId,
  onPickNode,
  typingNicks,
  live,
}: {
  messages: ChatMessage[];
  onSent: (message: ChatMessage) => void;
  nodeById: Map<number, NodeRow>;
  /** Currently selected on the map — offered as the pin for the next line. */
  selectedId: number | null;
  /** Jump the map to a pinned node. */
  onPickNode: (id: number) => void;
  /** Other officers composing right now (already excludes self). */
  typingNicks: string[];
  live: boolean;
}) {
  const { t, locale, n } = useT();
  const [text, setText] = useState("");
  const [pin, setPin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lastPulseRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);

  // Tap on the map = pin for the next line. Matches the map status hint.
  // Clearing the selection does not drop an explicit pin the officer kept.
  useEffect(() => {
    if (selectedId !== null) setPin(selectedId);
  }, [selectedId]);

  // Follow the conversation, but never yank the view away from somebody who
  // scrolled up to re-read the plan. Typing line is outside the scroll box.
  useEffect(() => {
    if (!atBottomRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void reportTyping(false);
      }
    };
  }, []);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  function pulseTyping(active: boolean) {
    if (active) {
      const now = Date.now();
      if (
        typingActiveRef.current &&
        now - lastPulseRef.current < TYPING_PULSE_MS
      ) {
        // Still composing — just refresh the idle timer, no new SSE frame.
      } else {
        typingActiveRef.current = true;
        lastPulseRef.current = now;
        void reportTyping(true);
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        typingActiveRef.current = false;
        lastPulseRef.current = 0;
        void reportTyping(false);
      }, TYPING_IDLE_MS);
    } else if (typingActiveRef.current) {
      typingActiveRef.current = false;
      lastPulseRef.current = 0;
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      void reportTyping(false);
    }
  }

  function onTextChange(value: string) {
    setText(value);
    if (error) setError(null);
    if (value.trim()) pulseTyping(true);
    else pulseTyping(false);
  }

  function submit() {
    const body = text.trim();
    if (!body || pending) return;
    const nodeId = pin;
    pulseTyping(false);
    startTransition(() => {
      void (async () => {
        const res = await sendMessage(body, nodeId);
        if (res.ok) {
          setText("");
          // Keep the pin: planning a front is usually several lines about the
          // same node, and forcing re-pin after every send is busywork.
          setError(null);
          atBottomRef.current = true;
          // Own line shows up now; the socket echo is deduped by id.
          if (res.sent) onSent(res.sent);
        } else {
          setError(res.error ? t(res.error) : t("chat.failed"));
        }
      })();
    });
  }

  const pinned = pin !== null ? nodeById.get(pin) : undefined;
  const selectedNode =
    selectedId !== null ? nodeById.get(selectedId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        <span className="font-medium">{t("chat.title")}</span>
        <span
          className={`ms-auto inline-flex items-center gap-1.5 text-[11px] ${
            live ? "text-[var(--color-text-soft)]" : "text-[var(--color-text-dim)]"
          }`}
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${
              live ? "bg-emerald-400" : "bg-[var(--color-text-dim)]"
            }`}
          />
          {t(live ? "chat.live" : "chat.offline")}
        </span>
      </div>

      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--color-text-dim)]">
            {t("chat.empty.hint")}
          </p>
        ) : (
          messages.map((m) => {
            const node = m.nodeId !== null ? nodeById.get(m.nodeId) : undefined;
            return (
              <div key={m.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-[var(--color-accent)]">
                    {m.nick}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-dim)]">
                    {formatTime(m.at, locale)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[var(--color-text)]">
                  {m.body}
                </p>
                {m.nodeId !== null ? (
                  <button
                    type="button"
                    onClick={() => onPickNode(m.nodeId!)}
                    className="mt-1 inline-flex min-h-7 items-center gap-1 rounded-md bg-[var(--color-panel-2)] px-2 text-[11px] text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                  >
                    <MapPin size={12} />
                    {node
                      ? `${node.name} · ${node.x}:${node.y}`
                      : t("chat.nodeGone")}
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t px-3 py-2">
        {typingNicks.length > 0 ? (
          <p
            className="mb-1.5 truncate text-[11px] italic text-[var(--color-text-dim)]"
            aria-live="polite"
          >
            {formatTyping(typingNicks, t, n)}
          </p>
        ) : null}

        {pin !== null ? (
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[var(--color-text-soft)]">
            <MapPin size={12} />
            <span className="truncate">
              {pinned
                ? `${pinned.name} · ${pinned.x}:${pinned.y}`
                : t("chat.nodeGone")}
            </span>
            <button
              type="button"
              onClick={() => setPin(null)}
              aria-label={t("chat.unpin")}
              className="ms-auto rounded p-1 hover:text-[var(--color-text)]"
            >
              <X size={12} />
            </button>
          </div>
        ) : selectedNode ? (
          // Officer unpinned but the map selection is still that node —
          // one tap puts the pin back without re-picking on the board.
          <button
            type="button"
            onClick={() => setPin(selectedNode.id)}
            className="mb-1.5 inline-flex min-h-7 items-center gap-1 rounded-md bg-[var(--color-panel-2)] px-2 text-[11px] text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
          >
            <MapPin size={12} />
            {t("chat.pin")}: {selectedNode.name}
          </button>
        ) : null}

        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line: this is typed on a
              // phone between two taps on the map, not composed in an editor.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={600}
            placeholder={t("chat.placeholder")}
            className="min-h-10 flex-1 resize-none rounded-lg bg-[var(--color-panel-2)] px-2.5 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={pending || !text.trim()}
            aria-label={t("chat.send")}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] text-black disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>

        {error ? (
          <p className="mt-1 text-[11px] text-[var(--color-danger,#f87171)]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatTyping(
  nicks: string[],
  t: (key: MessageKey, params?: Params) => string,
  formatN: (value: number) => string,
): string {
  if (nicks.length === 1) {
    return t("chat.typingOne", { nick: nicks[0] });
  }
  if (nicks.length === 2) {
    return t("chat.typingTwo", { a: nicks[0], b: nicks[1] });
  }
  // Three+: name the first two, then how many more are still composing.
  return t("chat.typingMore", {
    a: nicks[0],
    b: nicks[1],
    n: formatN(nicks.length - 2),
  });
}

/** Wall-clock time in the officer's interface language (Latin digits for AR). */
function formatTime(at: number, locale: Locale): string {
  return new Intl.DateTimeFormat(numberLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(at * 1000));
}
