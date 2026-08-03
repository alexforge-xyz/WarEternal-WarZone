"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { LOCALES, LOCALE_META } from "@/lib/i18n";
import { useT } from "./i18n-provider";
import { LocaleFlag } from "./locale-flag";

/**
 * Language switch — pure client. No server action, no reload.
 * Choice lives in localStorage (+ cookie best-effort for SSR next time).
 *
 * One flag in the header, the list behind a tap. Three codes side by side ate
 * header width that the nav needs on a phone, and they made the current
 * language look like just another button rather than the state it is.
 */
export function LangSwitcher() {
  const { locale, setLocale, t } = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // `pointerdown`, not `click`: on iOS a tap outside an open menu would
    // otherwise land on whatever is underneath before the menu closes.
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("nav.language")}: ${LOCALE_META[locale].label}`}
        title={LOCALE_META[locale].label}
        className="flex min-h-9 items-center gap-1 rounded-lg border px-1.5 text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
      >
        <LocaleFlag locale={locale} size={20} />
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        // `end-0`, never `right-0`: in Arabic the header is mirrored and the
        // menu has to hang off the same edge as the button that opened it.
        <div
          role="menu"
          className="absolute end-0 top-full z-40 mt-1 min-w-44 overflow-hidden rounded-lg border bg-[var(--color-panel)] py-1 shadow-lg"
        >
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={locale === l}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              // Each row is labelled in its own language, so `lang` has to
              // travel with it — a screen reader must not read "العربية"
              // with a Russian voice, and the row must lay itself out RTL
              // even while the page around it is left to right.
              lang={l}
              dir={LOCALE_META[l].dir}
              className={`flex min-h-11 w-full items-center gap-2.5 px-3 text-start text-sm transition-colors hover:bg-[var(--color-panel-2)] ${
                locale === l
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-text-dim)]"
              }`}
            >
              <LocaleFlag locale={l} size={20} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {LOCALE_META[l].label}
              </span>
              {locale === l && (
                <Check
                  size={14}
                  className="shrink-0 text-[var(--color-accent)]"
                  aria-hidden
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
