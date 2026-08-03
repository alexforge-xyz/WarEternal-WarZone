"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_META,
  numberLocale,
  translate,
  type Locale,
  type MessageKey,
  type Params,
} from "@/lib/i18n";

/** localStorage key — same name as the cookie for simplicity. */
export const LOCALE_STORAGE_KEY = LOCALE_COOKIE;

type Ctx = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: MessageKey, params?: Params) => string;
  n: (value: number) => string;
  /** Persist choice (storage + cookie) and update the UI immediately. */
  setLocale: (locale: Locale) => void;
};

const I18nCtx = createContext<Ctx | null>(null);

function writeCookie(locale: Locale) {
  const maxAge = 60 * 60 * 24 * 365;
  try {
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  } catch {
    /* private mode / blocked cookies — localStorage still wins for the UI */
  }
}

function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(raw)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

function applyHtmlLang(locale: Locale) {
  const meta = LOCALE_META[locale];
  document.documentElement.lang = locale;
  document.documentElement.dir = meta.dir;
}

export function I18nProvider({
  locale: serverLocale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  // Start with the server guess (cookie / Accept-Language), then let an
  // explicit user choice in localStorage override it after mount. Phone
  // browsers often drop or ignore cookies; storage is what actually sticks.
  const [locale, setLocaleState] = useState<Locale>(serverLocale);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) {
      setLocaleState(stored);
      applyHtmlLang(stored);
      writeCookie(stored);
      return;
    }
    // First visit: mirror the server choice into storage so the next load is stable.
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, serverLocale);
    } catch {
      /* ignore */
    }
    applyHtmlLang(serverLocale);
  }, [serverLocale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    writeCookie(next);
    applyHtmlLang(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      locale,
      dir: LOCALE_META[locale].dir,
      t: (key, params) => translate(locale, key, params),
      n: (value) => value.toLocaleString(numberLocale(locale)),
      setLocale,
    }),
    [locale, setLocale],
  );

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(I18nCtx);
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    dir: "ltr",
    t: (key, params) => translate(DEFAULT_LOCALE, key, params),
    n: (value) => value.toLocaleString(numberLocale(DEFAULT_LOCALE)),
    setLocale: () => {},
  };
}
