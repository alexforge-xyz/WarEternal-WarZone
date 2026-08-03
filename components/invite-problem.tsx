"use client";

import Link from "next/link";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "./i18n-provider";

/** Shown when an invite link is spent, revoked or past its expiry. */
export function InviteProblem({ reason }: { reason: MessageKey }) {
  const { t } = useT();
  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border bg-[var(--color-panel)] p-5 text-center">
      <p className="mb-4 text-sm text-[var(--color-danger)]">{t(reason)}</p>
      <Link href="/map" className="btn min-h-10">
        {t("nav.map")}
      </Link>
    </div>
  );
}
