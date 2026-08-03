"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  ACCOUNT_ROLES,
  auditLog,
  invites,
  users,
  type AccountRole,
} from "@/db/schema";
import {
  authenticate,
  canDisable,
  endSession,
  getUser,
  invitableRoles,
  startSession,
} from "@/lib/auth";
import type { MessageKey } from "@/lib/i18n";
import { hashPassword, newToken } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, verifyTurnstile } from "@/lib/turnstile";

export type AuthState = { ok: boolean; error?: MessageKey };

const INVITE_TTL = 60 * 60 * 24 * 7; // 7 days
const NICK_MAX = 24;

function now(): number {
  return Math.floor(Date.now() / 1000);
}

async function log(actor: string | null, action: string, detail?: string) {
  await db.insert(auditLog).values({ actor, action, detail: detail ?? null });
}

function cleanNick(raw: string): string | null {
  const nick = raw.trim().replace(/\s+/g, " ");
  if (nick.length < 2 || nick.length > NICK_MAX) return null;
  // Anything printable is fine — game nicks carry tags like "[K6] Name".
  if (/[\u0000-\u001f\u007f]/.test(nick)) return null;
  return nick;
}

/* -------------------------------- login -------------------------------- */

export async function login(
  _prev: AuthState,
  fd: FormData,
): Promise<AuthState> {
  const ip = await clientIp();
  if (!checkRateLimit(`login:${ip}`, 20)) {
    return { ok: false, error: "auth.tooMany" };
  }
  if (!(await verifyTurnstile(String(fd.get("cf-turnstile-response") ?? "")))) {
    return { ok: false, error: "auth.bot" };
  }

  const nick = String(fd.get("nick") ?? "");
  const password = String(fd.get("password") ?? "");

  const user = await authenticate(nick, password);
  if (!user) {
    await log(null, "login_failed", nick.trim().slice(0, NICK_MAX));
    return { ok: false, error: "auth.wrong" };
  }

  await startSession(user.id);
  await log(user.nick, "login");
  revalidatePath("/", "layout");
  // Redirect from the server: revalidation re-renders this route, which can
  // unmount the form before any client-side navigation effect would run.
  redirect("/");
}

export async function logout(): Promise<void> {
  const user = await getUser();
  await endSession();
  if (user) await log(user.nick, "logout");
  revalidatePath("/", "layout");
}

/* --------------------------- join by invite ---------------------------- */

export async function join(
  _prev: AuthState,
  fd: FormData,
): Promise<AuthState> {
  const ip = await clientIp();
  if (!checkRateLimit(`join:${ip}`, 10)) {
    return { ok: false, error: "auth.tooMany" };
  }
  if (!(await verifyTurnstile(String(fd.get("cf-turnstile-response") ?? "")))) {
    return { ok: false, error: "auth.bot" };
  }

  const token = String(fd.get("token") ?? "").trim();
  const nick = cleanNick(String(fd.get("nick") ?? ""));
  const password = String(fd.get("password") ?? "");

  if (!nick) return { ok: false, error: "auth.badNick" };
  if (password.length < 8) return { ok: false, error: "auth.shortPassword" };

  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.token, token), isNull(invites.usedAt)))
    .limit(1);

  if (!invite) return { ok: false, error: "auth.badInvite" };
  if (invite.expiresAt < now()) return { ok: false, error: "auth.expiredInvite" };

  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.nick, nick))
    .limit(1);
  if (taken) return { ok: false, error: "auth.nickTaken" };

  const [user] = await db
    .insert(users)
    .values({
      nick,
      passwordHash: await hashPassword(password),
      role: invite.role,
      invitedBy: invite.createdBy,
    })
    .returning();

  // Single-use: mark it consumed only after the account actually exists.
  const consumed = await db
    .update(invites)
    .set({ usedAt: now(), usedBy: nick })
    .where(and(eq(invites.id, invite.id), isNull(invites.usedAt)))
    .returning({ id: invites.id });

  if (!consumed.length) {
    // Someone used the same link first — undo and send them back.
    await db.delete(users).where(eq(users.id, user.id));
    return { ok: false, error: "auth.badInvite" };
  }

  await startSession(user.id);
  await log(nick, "join", `role=${invite.role} by=${invite.createdBy}`);
  revalidatePath("/", "layout");
  // Must be a server-side redirect: consuming the invite makes this very page
  // render "link already used", which would otherwise be the last thing the
  // new officer sees after a successful sign-up.
  redirect("/");
}

/* ------------------------------- invites ------------------------------- */

export type InviteState = AuthState & { token?: string };

export async function createInvite(role: string): Promise<InviteState> {
  const user = await getUser();
  if (!user) return { ok: false, error: "auth.denied" };

  const allowed = invitableRoles(user.role);
  if (!ACCOUNT_ROLES.includes(role as AccountRole)) {
    return { ok: false, error: "auth.denied" };
  }
  if (!allowed.includes(role as AccountRole)) {
    return { ok: false, error: "auth.denied" };
  }
  if (!checkRateLimit(`invite:${user.id}`, 30)) {
    return { ok: false, error: "auth.tooMany" };
  }

  const token = newToken();
  await db.insert(invites).values({
    token,
    role: role as AccountRole,
    createdBy: user.nick,
    expiresAt: now() + INVITE_TTL,
  });
  await log(user.nick, "invite_created", `role=${role}`);

  revalidatePath("/team");
  return { ok: true, token };
}

export async function revokeInvite(id: number): Promise<AuthState> {
  const user = await getUser();
  if (!user || invitableRoles(user.role).length === 0) {
    return { ok: false, error: "auth.denied" };
  }

  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.id, id))
    .limit(1);
  if (!invite) return { ok: false, error: "auth.denied" };
  // An officer may only revoke what an officer could have issued.
  if (!invitableRoles(user.role).includes(invite.role)) {
    return { ok: false, error: "auth.denied" };
  }

  await db.delete(invites).where(eq(invites.id, id));
  await log(user.nick, "invite_revoked", `role=${invite.role}`);
  revalidatePath("/team");
  return { ok: true };
}

/* -------------------------------- users -------------------------------- */

export async function setUserDisabled(
  userId: number,
  disabled: boolean,
): Promise<AuthState> {
  const actor = await getUser();
  if (!actor) return { ok: false, error: "auth.denied" };

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) return { ok: false, error: "auth.denied" };
  if (!canDisable(actor, target)) return { ok: false, error: "auth.denied" };

  await db
    .update(users)
    .set({
      disabledAt: disabled ? now() : null,
      disabledBy: disabled ? actor.nick : null,
    })
    .where(eq(users.id, userId));

  await log(
    actor.nick,
    disabled ? "user_disabled" : "user_enabled",
    `${target.nick} (${target.role})`,
  );
  revalidatePath("/team");
  return { ok: true };
}
