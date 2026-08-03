import "server-only";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "./i18n";

/**
 * Interface language for the first server paint.
 * Priority: cookie (user chose before) → Accept-Language → default.
 * After hydration the client may override from localStorage (see I18nProvider):
 * real phones often drop cookies, so storage is the durable choice.
 */
export async function getLocale(): Promise<Locale> {
  const raw = (await cookies()).get(LOCALE_COOKIE)?.value;
  // Client may write encodeURIComponent("ru") → "ru"; decode safely either way.
  let fromCookie: string | undefined;
  if (raw) {
    try {
      fromCookie = decodeURIComponent(raw).trim().toLowerCase();
    } catch {
      fromCookie = raw.trim().toLowerCase();
    }
  }
  if (isLocale(fromCookie)) return fromCookie;

  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}
