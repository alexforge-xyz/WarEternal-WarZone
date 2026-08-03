import "server-only";
import { headers } from "next/headers";

/**
 * Cloudflare Turnstile server-side verification for sign-in and join forms.
 *
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY — public, rendered in the widget (client)
 *   TURNSTILE_SECRET_KEY           — secret, used here for siteverify (server)
 *
 * Unset secret → verification is a no-op so local dev still submits forms.
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → skip the check
  if (!token) return false; // configured but no token → reject

  let ip: string | undefined;
  try {
    ip =
      (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;
  } catch {
    /* headers() unavailable outside a request — ignore */
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      console.error("[turnstile] siteverify HTTP", res.status);
      return false;
    }
    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) console.warn("[turnstile] failed:", data["error-codes"]);
    return data.success === true;
  } catch (err) {
    console.error("[turnstile] verify error:", err);
    return false;
  }
}

/** Best-effort client IP, used as the rate-limit key. */
export async function clientIp(): Promise<string> {
  try {
    return (
      (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
    );
  } catch {
    return "local";
  }
}
