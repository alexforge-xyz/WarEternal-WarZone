"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget. Renders the challenge and, once it passes,
 * injects a hidden `cf-turnstile-response` input inside this element, which the
 * surrounding <form>'s FormData picks up automatically. Must live in a form.
 *
 * No site key configured → renders nothing, so local forms still submit
 * (the server-side verify is a matching no-op).
 */

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: { sitekey: string; theme?: "light" | "dark" | "auto"; action?: string },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-turnstile]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      if (window.turnstile) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.dataset.turnstile = "1";
    s.addEventListener("load", () => resolve(), { once: true });
    document.head.appendChild(s);
  });
}

export function Turnstile({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let active = true;
    loadScript().then(() => {
      if (!active || !ref.current || !window.turnstile || widgetId.current) {
        return;
      }
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        theme: "dark",
        action: "submit",
      });
    });
    return () => {
      active = false;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* widget already gone */
        }
        widgetId.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} className={className} />;
}
