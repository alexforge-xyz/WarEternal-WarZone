"use client";

import { useEffect } from "react";

/**
 * Real phones (not desktop DevTools) resize the *dynamic* viewport when the
 * URL bar shows or hides. `100dvh` follows that → the whole app shell reflows
 * under a pan finger, which looks like the page is flickering (header often
 * stays put). Lock a CSS pixel height once and only refresh when the *width*
 * changes (rotate / split-screen) — never on chrome collapse (height-only).
 */
function applyAppHeight() {
  const h = window.innerHeight;
  if (h < 100) return;
  document.documentElement.style.setProperty("--app-height", `${h}px`);
}

export function ViewportLock() {
  useEffect(() => {
    applyAppHeight();
    let lastWidth = window.innerWidth;

    const onOrientation = () => {
      // After rotate, chrome settles a frame or two later.
      requestAnimationFrame(() => {
        lastWidth = window.innerWidth;
        applyAppHeight();
        setTimeout(() => {
          lastWidth = window.innerWidth;
          applyAppHeight();
        }, 250);
      });
    };

    const onResize = () => {
      const w = window.innerWidth;
      // Height-only jumps = URL bar show/hide on mobile. Ignore them.
      if (w === lastWidth) return;
      lastWidth = w;
      applyAppHeight();
    };

    window.addEventListener("orientationchange", onOrientation);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("orientationchange", onOrientation);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return null;
}
