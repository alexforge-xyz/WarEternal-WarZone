"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Map as MapIcon, Share2, Table2, Users } from "lucide-react";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "./i18n-provider";
import { useRole } from "./role-provider";

type Item = {
  href: string;
  key: MessageKey;
  icon: typeof Table2;
  /** Roads are only useful to whoever may edit them. */
  adminOnly?: boolean;
  /** Team management starts at officer. */
  officerOnly?: boolean;
};

const LINKS: Item[] = [
  { href: "/map", key: "nav.map", icon: MapIcon },
  { href: "/stats", key: "nav.stats", icon: BarChart3 },
  { href: "/", key: "nav.nodes", icon: Table2 },
  { href: "/links", key: "nav.links", icon: Share2, adminOnly: true },
  { href: "/team", key: "team.title", icon: Users, officerOnly: true },
];

export function NavLinks() {
  const pathname = usePathname();
  const { t } = useT();
  const { canEdit, canPlan } = useRole();

  const visible = LINKS.filter(
    (l) => (!l.adminOnly || canEdit) && (!l.officerOnly || canPlan),
  );

  return (
    <nav className="flex items-center gap-0.5">
      {visible.map(({ href, key, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors sm:px-3 ${
              active
                ? "bg-[var(--color-panel-2)] text-[var(--color-text)]"
                : "text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
            }`}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
