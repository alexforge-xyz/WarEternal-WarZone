import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type AccountRole, type UserRow } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";
import type { Role } from "./roles";

/**
 * Real accounts, created only through one-time invites. The cookie carries the
 * user id and is HMAC-signed; the role is read from the row on every request,
 * so disabling someone takes effect on their next click rather than in a month.
 */

const COOKIE = "warzone_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days: re-logging in mid-event is worse

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function createToken(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + MAX_AGE * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): number | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return typeof data.uid === "number" ? data.uid : null;
  } catch {
    return null;
  }
}

export async function startSession(userId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, createToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** The signed-in account, or null. Disabled accounts read as signed out. */
export async function getUser(): Promise<UserRow | null> {
  const store = await cookies();
  const uid = verifyToken(store.get(COOKIE)?.value);
  if (uid === null) return null;

  const [row] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!row || row.disabledAt) return null;
  return row;
}

/** Never throws: no session simply means `guest`, which may read everything. */
export async function getRole(): Promise<Role> {
  return (await getUser())?.role ?? "guest";
}

/**
 * Read a secret from the environment. Trims whitespace and optional wrapping
 * quotes so `.env` / systemd `EnvironmentFile` quirks do not block first login.
 */
function envCredential(name: string): string | null {
  const raw = process.env[name];
  if (raw == null) return null;
  let v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1);
  }
  return v.length > 0 ? v : null;
}

/**
 * First-run bootstrap: while the users table is empty, the credentials in
 * ADMIN_NICK / ADMIN_PASSWORD create the admin account. Once that account
 * exists the env values are ignored, so there is no permanent backdoor.
 */
async function bootstrapAdmin(
  nick: string,
  password: string,
): Promise<UserRow | null> {
  const envNick = envCredential("ADMIN_NICK");
  const envPass = envCredential("ADMIN_PASSWORD");
  if (!envNick || !envPass) return null;

  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  if (existing) return null;

  if (nick.trim().toLowerCase() !== envNick.toLowerCase()) return null;
  if (password !== envPass) return null;

  const [row] = await db
    .insert(users)
    .values({
      nick: envNick,
      passwordHash: await hashPassword(envPass),
      role: "admin",
    })
    .returning();
  return row;
}

export async function authenticate(
  nick: string,
  password: string,
): Promise<UserRow | null> {
  const clean = nick.trim();
  if (!clean || !password) return null;

  const bootstrapped = await bootstrapAdmin(clean, password);
  if (bootstrapped) return bootstrapped;

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.nick, clean))
    .limit(1);
  if (!row || row.disabledAt) return null;
  if (!(await verifyPassword(password, row.passwordHash))) return null;

  await db
    .update(users)
    .set({ lastSeenAt: Math.floor(Date.now() / 1000) })
    .where(eq(users.id, row.id));
  return row;
}

/** Who may hand out which role: never a peer, never a superior. */
export function invitableRoles(role: Role): AccountRole[] {
  if (role === "admin") return ["officer", "helper"];
  if (role === "officer") return ["helper"];
  return [];
}

/** Admin may disable anyone but themselves; an officer only helpers. */
export function canDisable(actor: UserRow, target: UserRow): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === "admin") return true;
  if (actor.role === "officer") return target.role === "helper";
  return false;
}
