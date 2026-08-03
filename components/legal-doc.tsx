import type { ReactNode } from "react";
import Link from "next/link";

const LINKS = [
  { href: "/legal", label: "Legal notice" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms of use" },
] as const;

export function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article
      lang="en"
      className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10"
    >
      <nav className="mb-6 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-dim)]">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="underline-offset-2 hover:text-[var(--color-text-soft)] hover:underline"
          >
            {label}
          </Link>
        ))}
      </nav>

      <header className="mb-8 border-b border-[var(--color-line)] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
          {title}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          Last updated: {updated}
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-dim)]">
          This page is provided in English only.
        </p>
      </header>

      <div className="legal-prose space-y-5 text-sm leading-relaxed text-[var(--color-text-soft)] [&_a]:text-[var(--color-accent)] [&_a]:underline-offset-2 hover:[&_a]:underline [&_code]:rounded [&_code]:bg-[var(--color-panel-2)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-[var(--color-text)] [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-[var(--color-text)] [&_li]:ms-5 [&_li]:list-disc [&_li]:marker:text-[var(--color-text-dim)] [&_strong]:font-medium [&_strong]:text-[var(--color-text)] [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}
