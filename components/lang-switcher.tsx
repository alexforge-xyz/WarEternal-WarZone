"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/locale";
import { LOCALES, LOCALE_META } from "@/lib/i18n";
import { useT } from "./i18n-provider";

export function LangSwitcher() {
  const { locale } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          lang={l}
          title={LOCALE_META[l].label}
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
