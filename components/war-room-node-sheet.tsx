"use client";

import { useState, useTransition } from "react";
import {
  MessageSquarePlus,
  Route,
  RouteOff,
  Trash2,
  X,
} from "lucide-react";
import {
  addPlanNote,
  addPlanPath,
  deletePlanNote,
  removeNodeFromPlan,
} from "@/app/actions/plan";
import type { NodeRow } from "@/db/schema";
import type { MessageKey, Params } from "@/lib/i18n";
import type { PlanNoteView, PlanSnapshot } from "@/lib/plan-types";
import { useT } from "./i18n-provider";

/**
 * Long-press sheet: blur the board, act on the node (plan / chat), manage notes.
 */
export function WarRoomNodeSheet({
  node,
  inPlan,
  /** Owned by planning kingdom — trail add does not apply. */
  isOurs,
  notes,
  onClose,
  onPlan,
  onShareChat,
}: {
  node: NodeRow;
  inPlan: boolean;
  isOurs: boolean;
  notes: PlanNoteView[];
  onClose: () => void;
  onPlan: (plan: PlanSnapshot) => void;
  onShareChat: (nodeId: number) => void;
}) {
  const { t, n } = useT();
  const [pending, start] = useTransition();
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(
    fn: () => Promise<{
      ok: boolean;
      plan?: PlanSnapshot;
      error?: MessageKey;
      params?: Params;
    }>,
  ) {
    setError(null);
    start(() => {
      void (async () => {
        const res = await fn();
        if (res.ok && res.plan) onPlan(res.plan);
        // `params` carries things like the name of the gate that blocked the
        // route; without it the message renders a literal "{name}".
        else if (!res.ok && res.error) setError(t(res.error, res.params));
      })();
    });
  }

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end bg-black/45 backdrop-blur-sm sm:justify-center sm:p-6"
      role="dialog"
      aria-modal
      aria-label={node.name}
      onClick={onClose}
    >
      <div
        className="max-h-[85%] overflow-y-auto rounded-t-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3 shadow-xl sm:mx-auto sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{node.name}</p>
            <p className="text-[11px] text-[var(--color-text-dim)]">
              {node.x}:{node.y} · Lv.{n(node.level)}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--color-text-dim)] hover:bg-[var(--color-panel-2)]"
            aria-label={t("plan.menuClose")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {inPlan ? (
            <MenuBtn
              disabled={pending}
              icon={<RouteOff size={16} />}
              label={t("plan.removeFromPlan")}
              onClick={() => {
                run(async () => {
                  const res = await removeNodeFromPlan(node.id);
                  if (res.ok) onClose();
                  return res;
                });
              }}
            />
          ) : !isOurs ? (
            <MenuBtn
              disabled={pending}
              icon={<Route size={16} />}
              label={t("plan.addToPlan")}
              onClick={() => {
                run(async () => {
                  const res = await addPlanPath(node.id);
                  if (res.ok) onClose();
                  return res;
                });
              }}
            />
          ) : null}
          <MenuBtn
            disabled={pending}
            icon={<MessageSquarePlus size={16} />}
            label={t("plan.shareChat")}
            onClick={() => {
              onShareChat(node.id);
              onClose();
            }}
          />
        </div>

        {error ? (
          <p className="mt-2 text-[11px] text-[var(--color-danger)]">{error}</p>
        ) : null}

        <div className="mt-4 border-t border-[var(--color-line)] pt-3">
          <p className="mb-2 text-xs font-medium text-[var(--color-text-soft)]">
            {t("plan.notes")}
          </p>

          {notes.length === 0 ? (
            <p className="mb-2 text-[11px] text-[var(--color-text-dim)]">
              {t("plan.notesEmpty")}
            </p>
          ) : (
            <ul className="mb-2 max-h-40 space-y-2 overflow-y-auto">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-lg bg-[var(--color-panel-2)] px-2.5 py-2 text-sm"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-[var(--color-accent)]">
                      {note.nick}
                    </span>
                    <button
                      type="button"
                      className="ms-auto rounded p-1 text-[var(--color-text-dim)] hover:text-[var(--color-danger)]"
                      disabled={pending}
                      aria-label={t("plan.noteDelete")}
                      onClick={() => run(() => deletePlanNote(note.id))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[var(--color-text)]">
                    {note.body}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              className="field !min-h-10 flex-1 !text-sm"
              value={noteText}
              maxLength={280}
              placeholder={t("plan.notePlaceholder")}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const body = noteText.trim();
                  if (!body || pending) return;
                  run(async () => {
                    const res = await addPlanNote(node.id, body);
                    if (res.ok) setNoteText("");
                    return res;
                  });
                }
              }}
            />
            <button
              type="button"
              className="btn !min-h-10 shrink-0 text-xs"
              disabled={pending || !noteText.trim()}
              onClick={() => {
                const body = noteText.trim();
                if (!body) return;
                run(async () => {
                  const res = await addPlanNote(node.id, body);
                  if (res.ok) setNoteText("");
                  return res;
                });
              }}
            >
              {t("plan.noteAdd")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-[var(--color-panel-2)] px-3 text-start text-sm hover:bg-[var(--color-line)] disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}
