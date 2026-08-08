/**
 * Freeze the map that is in the database right now into `db/seed-data.ts`.
 *
 * The static layer — where the objects are, what type and level they are, what
 * they buff, and which roads connect them — is entered by hand once and then
 * never changes. Keeping it in code means a fresh database comes up already
 * filled in, and the file diffs like source when the map is corrected.
 *
 * Ownership, shields and check timestamps are deliberately *not* exported:
 * those change every hour and belong to the running database only.
 *
 *   node scripts/export-seed.mjs
 *
 * Works on a local database file. To take the same snapshot off the live
 * droplet without shell access, an admin downloads it from `/nodes` — same
 * renderer, same bytes (see `lib/seed-format.mjs`).
 */
import Database from "better-sqlite3";
import { writeFileSync } from "node:fs";
import { renderSeedFile } from "../lib/seed-format.mjs";

const dbPath = process.env.SQLITE_PATH ?? "warzone.db";
const db = new Database(dbPath, { readonly: true });

const nodeRows = db.prepare("select * from nodes order by id").all();
const edgeRows = db.prepare("select * from edges order by id").all();

let kingdoms = [];
try {
  kingdoms = db.prepare("select * from kingdoms order by sort, id").all();
} catch {
  // Table not there yet.
}

const { text, nodeCount, edgeCount, kingdomCount } = renderSeedFile({
  nodes: nodeRows.map((n) => ({
    name: n.name,
    x: n.x,
    y: n.y,
    kind: n.kind,
    level: n.level,
    buffAtk: n.buff_atk,
    buffDef: n.buff_def,
    buffHp: n.buff_hp,
    kingdom: n.kingdom,
    amethystOverride: n.amethyst_override,
    sapphireOverride: n.sapphire_override,
    notes: n.notes,
  })),
  ids: nodeRows.map((n) => n.id),
  edges: edgeRows.map((e) => ({ aId: e.a_id, bId: e.b_id })),
  kingdoms: kingdoms.map((k) => ({
    id: k.id,
    number: k.number,
    name: k.name,
    color: k.color,
    sort: k.sort,
  })),
});

writeFileSync("db/seed-data.ts", text);
console.log(
  `db/seed-data.ts: ${nodeCount} nodes, ${edgeCount} edges, ${kingdomCount} kingdoms`,
);
