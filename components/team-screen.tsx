"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, ShieldOff, ShieldCheck, UserPlus } from "lucide-react";
import {
  createInvite,
  revokeInvite,
  setUserDisabled,
} from "@/app/actions/auth";
import type {
  AccountRole,
  AuditRow,
  InviteRow,
  UserRow,
} from "@/db/schema";
import type { MessageKey } from "@/lib/i18n";
import { formatAgo } from "@/lib/staleness";
import { useT } from "./i18n-provider";

const ROLE_KEY: Record<AccountRole, MessageKey> = {
  helper: "role.helper",
  officer: "role.officer",
  admin: "role.admin",
};

const ROLE_COLOR: Record<AccountRole, string> = {
  helper: "#38bdf8",
  officer: "#a78bfa",
  admin: "#facc15",
};

export function TeamScreen({
  me,
  users,
  invites,
  log,
  invitable,
  origin,
  now,
}: {
  me: UserRow;
  users: UserRow[];
  invites: InviteRow[];
  log: AuditRow[];
  invitable: AccountRole[];
  origin: string;
  now: number;
}) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  function makeInvite(role: AccountRole) {
    setError(null);
    startTransition(async () => {
      const res = await createInvite(role);
      if (!res.ok) setError(res.error ?? "auth.denied");
      else setFresh(res.token ?? null);
    });
  }

  async function copy(token: string) {
    const url = `${origin}/join/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked (http origin, or denied) — select it manually.
      window.prompt(t("team.link"), url);
    }
  }

  function toggleUser(user: UserRow) {
    const disabling = !user.disabledAt;
    if (disabling && !confirm(t("team.confirmDisable", { nick: user.nick }))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await setUserDisabled(user.id, disabling);
      if (!res.ok) setError(res.error ?? "auth.denied");
    });
  }

  const canManage = invitable.length > 0;

  return (
    <div className="mx-auto max-w-[1100px] px-3 py-5 sm:px-4">
      <h1 className="mb-4 text-lg font-semibold">{t("team.title")}</h1>

      {error && (
        <p className="mb-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
          {t(error)}
        </p>
      )}

      {canManage && (
        <section className="mb-4 rounded-xl border bg-[var(--color-panel)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            {invitable.map((role) => (
              <button
                key={role}
                type="button"
                disabled={pending}
                onClick={() => makeInvite(role)}
                className="btn min-h-10 text-xs"
                style={{ borderColor: `${ROLE_COLOR[role]}66` }}
              >
                <UserPlus size={14} style={{ color: ROLE_COLOR[role] }} />
                {t("team.invite")} · {t(ROLE_KEY[role])}
              </button>
            ))}
          </div>

          {fresh && (
            <div className="mt-3 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 p-3">
              <p className="mb-2 text-[11px] text-[var(--color-text-soft)]">
                {t("team.link")}
              </p>
              <div className="flex items-center gap-2">
                <code className="mono min-w-0 flex-1 truncate rounded bg-[var(--color-base)] px-2 py-1.5 text-xs">
                  {origin}/join/{fresh}
                </code>
                <button
                  type="button"
                  onClick={() => copy(fresh)}
                  className="btn !min-h-10 shrink-0 text-xs"
                >
                  {copied === fresh ? <Check size={14} /> : <Copy size={14} />}
                  {copied === fresh ? t("team.copied") : t("team.copy")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {canManage && (
        <section className="mb-4 rounded-xl border bg-[var(--color-panel)] p-4">
          <p className="label">{t("team.pending")}</p>
          {invites.length === 0 ? (
            <p className="text-xs text-[var(--color-text-dim)]">
              {t("team.noPending")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-xs"
                >
                  <Link2 size={13} className="text-[var(--color-text-dim)]" />
                  <span style={{ color: ROLE_COLOR[inv.role] }}>
                    {t(ROLE_KEY[inv.role])}
                  </span>
                  <span className="text-[var(--color-text-dim)]">
                    {t("team.invitedBy")}: {inv.createdBy}
                  </span>
                  <span className="text-[var(--color-text-dim)]">
                    {t("team.expires", {
                      t: formatAgo(Math.max(0, inv.expiresAt - now)),
                    })}
                  </span>
                  <div className="ms-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => copy(inv.token)}
                      className="btn btn-ghost !min-h-9 !px-2 text-xs"
                    >
                      {copied === inv.token ? (
                        <Check size={13} />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(() => void revokeInvite(inv.id))
                      }
                      className="btn btn-ghost !min-h-9 !px-2 text-xs hover:!border-[var(--color-danger)]"
                    >
                      {t("team.revoke")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mb-4 overflow-x-auto rounded-xl border bg-[var(--color-panel)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
              <th className="px-3 py-2 text-start font-medium">
                {t("team.nick")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("team.role")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("team.invitedBy")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("team.joined")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("team.lastSeen")}
              </th>
              <th className="px-3 py-2 text-start font-medium">
                {t("team.status")}
              </th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const disabled = Boolean(user.disabledAt);
              const mayToggle =
                user.id !== me.id &&
                (me.role === "admin" ||
                  (me.role === "officer" && user.role === "helper"));
              return (
                <tr
                  key={user.id}
                  className={`border-b border-[var(--color-line)]/50 last:border-0 ${
                    disabled ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-medium">
                    {user.nick}
                    {user.id === me.id && (
                      <span className="ms-1.5 text-[10px] text-[var(--color-text-dim)]">
                        ({t("team.you")})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{
                        color: ROLE_COLOR[user.role],
                        background: `${ROLE_COLOR[user.role]}1f`,
                      }}
                    >
                      {t(ROLE_KEY[user.role])}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {user.invitedBy ?? (
                      <span className="text-[var(--color-text-dim)]">—</span>
                    )}
                  </td>
                  <td className="mono px-3 py-2 text-xs text-[var(--color-text-dim)]">
                    {formatAgo(now - user.createdAt)}
                  </td>
                  <td className="mono px-3 py-2 text-xs text-[var(--color-text-dim)]">
                    {user.lastSeenAt ? formatAgo(now - user.lastSeenAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {disabled ? (
                      <span className="text-[var(--color-danger)]">
                        {t("team.disabled")}
                        {user.disabledBy && ` · ${user.disabledBy}`}
                      </span>
                    ) : (
                      <span className="text-[var(--color-ok)]">
                        {t("team.active")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end">
                    {mayToggle && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggleUser(user)}
                        className="btn btn-ghost !min-h-9 !px-2 text-xs"
                      >
                        {disabled ? (
                          <ShieldCheck size={13} />
                        ) : (
                          <ShieldOff
                            size={13}
                            className="text-[var(--color-danger)]"
                          />
                        )}
                        {disabled ? t("team.enable") : t("team.disable")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-[var(--color-text-dim)]">
            {t("team.noUsers")}
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-[var(--color-panel)] p-4">
        <p className="label">{t("team.log")}</p>
        <ul className="space-y-1 text-xs">
          {log.map((row) => (
            <li key={row.id} className="flex flex-wrap gap-2">
              <span className="mono w-12 shrink-0 text-[var(--color-text-dim)]">
                {formatAgo(now - row.at)}
              </span>
              <span className="font-medium">{row.actor ?? "—"}</span>
              <span className="text-[var(--color-text-soft)]">{row.action}</span>
              {row.detail && (
                <span className="text-[var(--color-text-dim)]">
                  {row.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
