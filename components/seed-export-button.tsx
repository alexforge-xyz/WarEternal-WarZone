"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useT } from "./i18n-provider";

/**
 * Admin: download the live map as `db/seed-data.ts`.
 *
 * `npm run db:export-seed` already does this, but only where there is a shell
 * and the database file. The map gets corrected in the running app — a road
 * fixed from a phone during an event — and until now those corrections existed
 * *only* in the live database, with no way to tell afterwards which ones they
 * were. This hands back the exact file to commit.
 *
 * A plain link would be simpler, but a 403 or a dead server would then look
 * like a click that did nothing: fetching lets the button say what happened,
 * and report how much it just froze.
 */
export function SeedExportButton() {
  const { t, n } = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setNote(null);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/seed", { cache: "no-store" });
      if (!res.ok) {
        setFailed(true);
        setNote(t(res.status === 403 ? "auth.denied" : "seed.failed"));
        return;
      }
      const nodes = Number(res.headers.get("X-Seed-Nodes") ?? 0);
      const edges = Number(res.headers.get("X-Seed-Edges") ?? 0);
      const blob = await res.blob();

      const name =
        /filename="([^"]+)"/.exec(
          res.headers.get("Content-Disposition") ?? "",
        )?.[1] ?? "seed-data.ts";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on the next tick — Safari cancels the download if the object
      // URL disappears in the same frame as the click.
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setNote(t("seed.done", { nodes: n(nodes), edges: n(edges) }));
    } catch {
      setFailed(true);
      setNote(t("seed.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border bg-[var(--color-panel)] p-3">
      <p className="label">{t("seed.title")}</p>
      <p className="mb-2 text-xs text-[var(--color-text-dim)]">
        {t("seed.hint")}
      </p>
      <button
        type="button"
        className="btn min-h-10 text-xs"
        disabled={busy}
        onClick={() => void download()}
      >
        <Download size={14} />
        {busy ? t("seed.working") : t("seed.download")}
      </button>
      {note && (
        <p
          className={`mt-2 text-[11px] leading-snug ${
            failed
              ? "text-[var(--color-danger)]"
              : "text-[var(--color-text-soft)]"
          }`}
        >
          {note}
        </p>
      )}
    </div>
  );
}
