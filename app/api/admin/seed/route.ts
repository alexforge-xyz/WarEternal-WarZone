import { asc } from "drizzle-orm";
import { db } from "@/db";
import { edges, kingdoms, nodes } from "@/db/schema";
import { getRole } from "@/lib/auth";
import { canEdit } from "@/lib/roles";
import { renderSeedFile } from "@/lib/seed-format.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Download the live map frozen into `db/seed-data.ts` — the fingerprint of
 * every node and road as they stand right now.
 *
 * `npm run db:export-seed` does the same thing, but only where there is a
 * shell and the database file. The map is corrected *in the running app*, on a
 * droplet, often from a phone, and those corrections were only ever in the
 * live database — nobody could remember afterwards which roads had moved. This
 * gives an admin the exact file to hand back to the repo.
 *
 * Static layer only: ownership, shields and check times are deliberately left
 * out, exactly as the script leaves them out. There is nothing here a guest
 * cannot already read off `/api/map`; the admin gate is because a whole-map
 * dump is an admin-shaped action, not because the coordinates are secret.
 */
export async function GET(): Promise<Response> {
  if (!canEdit(await getRole())) {
    return Response.json({ error: "denied" }, { status: 403 });
  }

  // id ASC on both: `SEED_EDGES` stores *index pairs into `SEED_NODES`*, so
  // the node order is load-bearing, not cosmetic.
  const [nodeRows, edgeRows, kingdomRows] = await Promise.all([
    db.select().from(nodes).orderBy(asc(nodes.id)),
    db.select().from(edges).orderBy(asc(edges.id)),
    db.select().from(kingdoms).orderBy(asc(kingdoms.sort), asc(kingdoms.id)),
  ]);

  const { text, nodeCount, edgeCount } = renderSeedFile({
    nodes: nodeRows.map((n) => ({
      name: n.name,
      x: n.x,
      y: n.y,
      kind: n.kind,
      level: n.level,
      buffAtk: n.buffAtk,
      buffDef: n.buffDef,
      buffHp: n.buffHp,
      kingdom: n.kingdom,
      amethystOverride: n.amethystOverride,
      sapphireOverride: n.sapphireOverride,
      notes: n.notes,
    })),
    ids: nodeRows.map((n) => n.id),
    edges: edgeRows.map((e) => ({ aId: e.aId, bId: e.bId })),
    kingdoms: kingdomRows.map((k) => ({
      id: k.id,
      number: k.number,
      name: k.name,
      color: k.color,
      sort: k.sort,
    })),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="seed-data.${stamp}.ts"`,
      "Cache-Control": "no-store",
      // Read by the button so it can say what it just handed over.
      "X-Seed-Nodes": String(nodeCount),
      "X-Seed-Edges": String(edgeCount),
    },
  });
}
