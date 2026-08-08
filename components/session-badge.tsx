"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import type { MessageKey } from "@/lib/i18n";
import type { Role } from "@/lib/roles";
import { useT } from "./i18n-provider";
import { useRole } from "./role-provider";

const ROLE_KEY: Record<Role, MessageKey> = {
  guest: "role.guest",
  helper: "role.helper",
  officer: "role.officer",
  admin: "role.admin",
};

export function SessionBadge() {
  const { t } = useT();
  const { role } = useRole();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (role === "guest") {
    return (
      <Link
        href="/login"
        className="btn btn-ghost !min-h-9 !px-2.5 text-xs"
        title={t("auth.readonly")}
      >
        <LogIn size={14} />
        <span className="hidden sm:inline">{t("auth.login")}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await logout();
          router.refresh();
        })
      }
      className="btn btn-ghost !min-h-9 shrink-0 !px-2.5 text-xs"
      // Both facts on the tooltip, since the role word is dropped on a phone:
      // there it was the widest thing in the header and the first cause of the
      // row overflowing. The icon still says "this is the way out".
      title={`${t(ROLE_KEY[role])} — ${t("auth.logout")}`}
    >
      <span className="hidden text-[var(--color-accent)] sm:inline">
        {t(ROLE_KEY[role])}
      </span>
      <LogOut size={14} />
    </button>
  );
}
