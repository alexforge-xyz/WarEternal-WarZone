import "server-only";
import crypto from "node:crypto";

/**
 * scrypt password hashing on top of node's crypto — no extra dependency, and
 * the stored value carries its own salt and parameters.
 *
 * Format: `scrypt$N$r$p$<salt base64url>$<hash base64url>`
 */

const N = 16384;
const r = 8;
const p = 1;
const KEY_LEN = 32;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LEN,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt);
  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");

  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      expected.length,
      { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), maxmem: 64 * 1024 * 1024 },
      (err, out) => (err ? reject(err) : resolve(out)),
    );
  }).catch(() => null);

  if (!key || key.length !== expected.length) return false;
  return crypto.timingSafeEqual(key, expected);
}

/** URL-safe one-time invite token. */
export function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}
