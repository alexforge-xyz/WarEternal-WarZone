"use client";

import { LOCALES, LOCALE_META } from "@/lib/i18n";
import { useT } from "./i18n-provider";

/**
 * Language switch — pure client. No server action, no reload.
 * Choice lives in localStorage (+ cookie best-effort for SSR next time).
 */
export function LangSwitcher() {
  const { locale, setLocale } = useT();

  return (
    <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          lang={l}
          title={LOCALE_META[l].label}
          aria-pressed={locale === l}
          className={`min-w-9 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            locale === l
              ? "bg-[var(--color-panel-2)] text-[var(--color-text)]"
              : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          }`}
        >
          {LOCALE_META[l].short}
        </button>
      ))}
    </div>
  );
}
