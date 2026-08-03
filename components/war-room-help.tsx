"use client";

import { Crosshair, Hand, MessageSquare, Route, X } from "lucide-react";
import { useT } from "./i18n-provider";

/**
 * Blurred overlay explaining war-room map gestures and the stats strip.
 */
export function WarRoomHelp({ onClose }: { onClose: () => void }) {
  const { t } = useT();

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end bg-black/45 backdrop-blur-sm sm:justify-center sm:p-6"
      role="dialog"
      aria-modal
      aria-labelledby="warroom-help-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85%] overflow-y-auto rounded-t-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-[#e6ebf5] shadow-xl sm:mx-auto sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-2">
          <p
            id="warroom-help-title"
            className="min-w-0 flex-1 text-base font-semibold text-[#e6ebf5]"
            style={{ color: "#e6ebf5" }}
          >
            {t("warroom.help.title")}
          </p>
          <button
            type="button"
            className="rounded-lg p-2 text-[#94a3b8] hover:bg-[var(--color-panel-2)] hover:text-[#e6ebf5]"
            aria-label={t("plan.menuClose")}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-[var(--color-text-soft)]">
          {t("warroom.help.intro")}
        </p>

        <ul className="space-y-3 text-sm">
          <HelpRow
            icon={<Hand size={16} />}
            title={t("warroom.help.tapTitle")}
            body={t("warroom.help.tapBody")}
          />
          <HelpRow
            icon={<Hand size={16} className="opacity-80" />}
            title={t("warroom.help.holdTitle")}
            body={t("warroom.help.holdBody")}
          />
          <HelpRow
            icon={<Route size={16} />}
            title={t("warroom.help.trailsTitle")}
            body={t("warroom.help.trailsBody")}
          />
          <HelpRow
            icon={<MessageSquare size={16} />}
            title={t("warroom.help.chatTitle")}
            body={t("warroom.help.chatBody")}
          />
          <HelpRow
            icon={<Crosshair size={16} />}
            title={t("warroom.help.toolsTitle")}
            body={t("warroom.help.toolsBody")}
          />
        </ul>

        <p className="mt-4 text-[11px] leading-snug text-[var(--color-text-dim)]">
          {t("warroom.help.readonly")}
        </p>

        <button
          type="button"
          className="btn mt-4 w-full !min-h-11"
          onClick={onClose}
        >
          {t("warroom.help.gotIt")}
        </button>
      </div>
    </div>
  );
}

function HelpRow({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-2.5 rounded-xl bg-[var(--color-panel-2)] px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-[var(--color-accent)]">{icon}</span>
      <div className="min-w-0">
        <p className="font-medium text-[var(--color-text)]">{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-text-soft)]">
          {body}
        </p>
      </div>
    </li>
  );
}
