import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { AUTHOR, GITHUB_URL, PROJECT_NAME } from "@/lib/constants";
import { LOCALE_META, translate } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { getRole } from "@/lib/auth";
import { getKingdoms } from "@/db/queries";
import { I18nProvider } from "@/components/i18n-provider";
import { KingdomsProvider } from "@/components/kingdoms-provider";
import { LangSwitcher } from "@/components/lang-switcher";
import { NavLinks } from "@/components/nav-links";
import { RoleProvider } from "@/components/role-provider";
import { SessionBadge } from "@/components/session-badge";
import { SupportButton } from "@/components/support-button";
import "./globals.css";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: `Conquest map for War Eternal — WarZone. ${AUTHOR}`,
  robots: { index: false, follow: false },
};

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
      <body className="flex min-h-[100dvh] flex-col">
        <I18nProvider locale={locale}>
          <RoleProvider role={role}>
            <KingdomsProvider kingdoms={kingdoms}>
              <header className="sticky top-0 z-30 border-b bg-[var(--color-panel)]/95 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:gap-3 sm:px-4">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <Link
                      href="/map"
                      className="hidden shrink-0 items-baseline gap-1.5 sm:flex"
                    >
                      <span className="font-semibold tracking-tight">
                        War Eternal
                      </span>
                      <span className="font-semibold tracking-tight text-[var(--color-accent)]">
                        WarZone
                      </span>
                    </Link>
                    <SupportButton />
                  </div>
                  <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
                    <NavLinks />
                    <LangSwitcher />
                    <SessionBadge />
                  </div>
                </div>
              </header>

              <main className="flex-1">{children}</main>

              <footer className="border-t px-4 py-3 text-center text-[11px] text-[var(--color-text-dim)]">
                <p>
                  {PROJECT_NAME} · {AUTHOR} ·{" "}
                  {translate(locale, "app.disclaimer")}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                  <Link
                    href="/legal"
                    className="underline-offset-2 hover:text-[var(--color-text-soft)] hover:underline"
                    lang="en"
                  >
                    Legal notice
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
                    Terms of use
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
