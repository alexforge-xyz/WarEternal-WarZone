"use client";

import { createContext, useContext, useMemo } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_META,
  numberLocale,
  translate,
  type Locale,
  type MessageKey,
  type Params,
} from "@/lib/i18n";

type Ctx = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: MessageKey, params?: Params) => string;
  n: (value: number) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<Ctx>(
    () => ({
      locale,
      dir: LOCALE_META[locale].dir,
      t: (key, params) => translate(locale, key, params),
      n: (value) => value.toLocaleString(numberLocale(locale)),
    }),
    [locale],
  );

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(I18nCtx);
  if (ctx) return ctx;
  // Defensive fallback so a stray component never crashes the page.
  return {
    locale: DEFAULT_LOCALE,
    dir: "ltr",
    t: (key, params) => translate(DEFAULT_LOCALE, key, params),
    n: (value) => value.toLocaleString(numberLocale(DEFAULT_LOCALE)),
  };
}
