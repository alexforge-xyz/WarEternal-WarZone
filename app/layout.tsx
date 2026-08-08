import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { AUTHOR, GITHUB_URL, PROJECT_NAME } from "@/lib/constants";
import { LOCALE_META } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { getRole } from "@/lib/auth";
import { getKingdoms } from "@/db/queries";
import { I18nProvider } from "@/components/i18n-provider";
import { KingdomsProvider } from "@/components/kingdoms-provider";
import { LangSwitcher } from "@/components/lang-switcher";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { RoleProvider } from "@/components/role-provider";
import { SessionBadge } from "@/components/session-badge";
import { SupportButton } from "@/components/support-button";
import { ViewportLock } from "@/components/viewport-lock";
import "./globals.css";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: `Conquest map for War Eternal — WarZone. ${AUTHOR}`,
  robots: { index: false, follow: false },
};

// Locale (and role) come from cookies — never statically cache the shell.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  // The map handles its own zoom; locking the page keeps a two-finger gesture
  // from zooming the whole UI on a phone.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0f17",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [locale, role, kingdomRows] = await Promise.all([
    getLocale(),
    getRole(),
    getKingdoms(),
  ]);
  const dir = LOCALE_META[locale].dir;

  // Every screen colours and names kingdoms, so the line-up is fetched once
  // here rather than threaded through each page.
  const kingdoms = kingdomRows.map(({ id, number, name, color }) => ({
    id,
    number,
    name,
    color,
  }));

  return (
    <html lang={locale} dir={dir}>
      {/*
        Fixed viewport shell: body does not scroll. Map screens fill `main`
        (`h-full`); long pages scroll *inside* main.

        Height is --app-height (set by ViewportLock), fallback 100svh — NOT
        100dvh. On a real phone dvh jumps when the browser chrome shows/hides
        during a map pan; DevTools "mobile mode" does not, which is why the
        flicker only showed up on an actual device.
      */}
      <body className="flex max-h-[var(--app-height,100svh)] min-h-0 flex-col overflow-hidden h-[var(--app-height,100svh)]">
        <ViewportLock />
        <I18nProvider locale={locale}>
          <RoleProvider role={role}>
            <KingdomsProvider kingdoms={kingdoms}>
              <header className="z-30 shrink-0 border-b bg-[var(--color-panel)]/95 backdrop-blur">
                {/*
                  Nothing here may overflow the phone: at 375px, admin sees six
                  nav links plus the mark, the Ko-fi button, the language picker
                  and the session badge, and the row was 14px wider than the
                  screen — so the ends piled on top of each other. The two outer
                  groups keep their size and the nav is the one thing allowed to
                  shrink and scroll, because it is the only part where a swipe
                  is a reasonable way to reach the rest.

                  No `overflow-hidden` on this row, however tempting: the
                  language menu hangs below the header, and clipping the row
                  cut it off so it read as being *under* the map. Containment
                  belongs on the nav, which is the only thing that overflows.
                */}
                <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:gap-3 sm:px-4">
                  <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    {/*
                      The mark stays on a phone even though the wordmark does
                      not: it is the only thing in the header that says which
                      app this is, and at 375px the words were already cut.
                    */}
                    <Link
                      href="/"
                      className="flex shrink-0 items-center gap-2"
                      aria-label={PROJECT_NAME}
                    >
                      <Logo
                        size={26}
                        className="shrink-0 text-[var(--color-text-soft)]"
                      />
                      <span className="hidden items-baseline gap-1.5 sm:flex">
                        <span className="font-semibold tracking-tight">
                          War Eternal
                        </span>
                        <span className="font-semibold tracking-tight text-[var(--color-accent)]">
                          WarZone
                        </span>
                      </span>
                    </Link>
                    <SupportButton />
                  </div>
                  <div className="ms-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <NavLinks />
                    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                      <LangSwitcher />
                      <SessionBadge />
                    </div>
                  </div>
                </div>
              </header>

              <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
                {children}
              </main>

              {/*
                Keep the footer to ONE short row. A tall chrome + map
                `min-h-[420px]` / wrong calc makes the page taller than the
                phone viewport — the browser then steals every touch for
                document scroll, and the map looks “frozen”.
              */}
              <footer className="shrink-0 border-t px-3 py-2 text-center text-[10px] leading-snug text-[var(--color-text-dim)] sm:text-[11px]">
                <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
                  <span>
                    {PROJECT_NAME} · {AUTHOR}
                  </span>
                  <span aria-hidden>·</span>
                  <Link
                    href="/legal"
                    className="underline-offset-2 hover:text-[var(--color-text-soft)] hover:underline"
                    lang="en"
                  >
                    Legal
                  </Link>
                  <span aria-hidden>·</span>
                  <Link
                    href="/privacy"
                    className="underline-offset-2 hover:text-[var(--color-text-soft)] hover:underline"
                    lang="en"
                  >
                    Privacy
                  </Link>
                  <span aria-hidden>·</span>
                  <Link
                    href="/terms"
                    className="underline-offset-2 hover:text-[var(--color-text-soft)] hover:underline"
                    lang="en"
                  >
                    Terms
                  </Link>
                  <span aria-hidden>·</span>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:text-[var(--color-text-soft)] hover:underline"
                    lang="en"
                  >
                    GitHub
                  </a>
                </p>
              </footer>
            </KingdomsProvider>
          </RoleProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
