"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { join, type AuthState } from "@/app/actions/auth";
import type { AccountRole } from "@/db/schema";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "./i18n-provider";
import { Turnstile } from "./turnstile";

const EMPTY: AuthState = { ok: false };

const ROLE_KEY: Record<AccountRole, MessageKey> = {
  helper: "role.helper",
  officer: "role.officer",
  admin: "role.admin",
};

export function JoinForm({
  token,
  role,
  invitedBy,
}: {
  token: string;
  role: AccountRole;
  invitedBy: string;
}) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState(join, EMPTY);

  return (
    <form
      action={formAction}
      className="mx-auto mt-12 w-full max-w-sm rounded-xl border bg-[var(--color-panel)] p-5"
    >
      <input type="hidden" name="token" value={token} />

      <h1 className="mb-1 text-lg font-semibold">{t("join.title")}</h1>
      <p className="text-xs text-[var(--color-accent)]">
        {t("join.roleIs", { role: t(ROLE_KEY[role]) })}
      </p>
      <p className="mb-4 text-xs text-[var(--color-text-dim)]">
        {t("join.by", { nick: invitedBy })}
      </p>

      <label className="label" htmlFor="nick">
        {t("auth.nick")}
      </label>
      <input
        id="nick"
        name="nick"
        className="field mb-3"
        placeholder="[K6] ..."
        autoComplete="username"
        maxLength={24}
        autoFocus
        required
      />

      <label className="label" htmlFor="password">
        {t("auth.password")}
      </label>
      <input
        id="password"
        name="password"
        type="password"
        className="field"
        autoComplete="new-password"
        minLength={8}
        required
      />

      <Turnstile className="mt-3" />

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary mt-4 min-h-11 w-full"
      >
        <UserPlus size={15} />
        {t("join.submit")}
      </button>

      {state.error && (
        <p className="mt-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
          {t(state.error)}
        </p>
      )}
    </form>
  );
}
