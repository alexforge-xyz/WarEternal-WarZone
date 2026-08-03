"use client";

import { Coffee } from "lucide-react";
import { KOFI_URL } from "@/lib/constants";
import { useT } from "./i18n-provider";

/** Header CTA → Ko-fi. Icon-only on phones so the nav stays roomy. */
export function SupportButton() {
  const { t } = useT();
  const label = t("app.support");

  return (
    <a
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="group relative inline-flex min-h-9 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg border border-[#ff6b6b]/35 bg-gradient-to-br from-[#ff6b6b]/15 to-[#ff9f43]/10 px-2.5 text-xs font-medium text-[#ffb4b0] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-[border-color,background,color,box-shadow,transform] duration-150 hover:border-[#ff6b6b]/65 hover:from-[#ff6b6b]/25 hover:to-[#ff9f43]/18 hover:text-[#ffe0de] hover:shadow-[0_0_16px_-4px_rgba(255,107,107,0.45)] active:scale-[0.98] sm:px-3"
    >
      <Coffee
        size={15}
        strokeWidth={2.25}
        className="shrink-0 text-[#ff8a80] transition-transform duration-150 group-hover:rotate-[-8deg] group-hover:scale-110"
      />
      <span className="hidden sm:inline">{label}</span>
    </a>
  );
}
