"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { login, type AuthState } from "@/app/actions/auth";
import { useT } from "./i18n-provider";
import { Turnstile } from "./turnstile";

const EMPTY: AuthState = { ok: false };

/** On success the action redirects server-side; only failures come back here. */
export function LoginForm() {
  const { t } = useT();
  const [state, formAction, pending] = useActionState(login, EMPTY);

  return (
    <form
      action={formAction}
      className="mx-auto mt-12 w-full max-w-sm rounded-xl border bg-[var(--color-panel)] p-5"
    >
      <h1 className="mb-1 text-lg font-semibold">{t("auth.login")}</h1>
      <p className="mb-4 text-xs text-[var(--color-text-dim)]">
        {t("auth.hint")}
      </p>

      <label className="label" htmlFor="nick">
        {t("auth.nick")}
      </label>
      <input
        id="nick"
        name="nick"
        className="field mb-3"
        autoComplete="username"
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
        autoComplete="current-password"
        required
      />

      <Turnstile className="mt-3" />

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary mt-4 min-h-11 w-full"
      >
        <LogIn size={15} />
        {t("auth.submit")}
      </button>

      {state.error && (
        <p className="mt-3 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
          {t(state.error)}
        </p>
      )}
    </form>
  );
}
