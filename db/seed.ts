import "server-only";
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { SEED_EDGES, SEED_KINGDOMS, SEED_NODES } from "./seed-data";
import { edges, kingdoms, nodes, normalizePair, type NewNode } from "./schema";
import * as schema from "./schema";

/**
 * Bring a fresh database up with the map already drawn.
 *
 * The static layer was surveyed by hand and lives in `db/seed-data.ts`; there
 * is no reason to make anyone re-enter it. Ownership is *not* seeded — a new
 * install starts with a complete, entirely unowned map, which is exactly the
 * state at the start of an event.
 *
 * Each table is filled only while it is empty, so this is a no-op on every
 * start after the first and can never overwrite what officers have entered.
 * Correcting the map afterwards is done through the UI (and re-frozen with
 * `npm run db:export-seed`), never by editing the seed and restarting.
 */
export function seedIfEmpty(db: BetterSQLite3Database<typeof schema>): void {
  // Runs at import time, before `npm run db:push` has necessarily been run on
  // a new checkout. Nothing to fill in that case — push, then restart.
  const ready = db.all<{ n: number }>(sql`
    select count(*) as n from sqlite_master
    where type = 'table' and name in ('kingdoms', 'nodes', 'edges')
  `);
  if (ready[0]?.n !== 3) return;

  // Read first, outside any transaction: on every start after the first this
  // costs two index lookups and takes no write lock at all. `next build`
  // imports this module from a dozen workers at once, and a seeded database
  // must not have them queueing behind each other.
  const needKingdoms = !db.select({ id: kingdoms.id }).from(kingdoms).limit(1).get();
  const needNodes = !db.select({ id: nodes.id }).from(nodes).limit(1).get();
  if (!needKingdoms && !needNodes) return;

  // `immediate` takes the write lock up front, so the checks below settle the
  // race rather than two workers both passing them and inserting twice.
  db.transaction((tx) => {
    if (!tx.select({ id: kingdoms.id }).from(kingdoms).limit(1).get()) {
      tx.insert(kingdoms).values(SEED_KINGDOMS).run();
    }

    if (tx.select({ id: nodes.id }).from(nodes).limit(1).get()) return;

    const rows: NewNode[] = SEED_NODES.map(
      ([name, x, y, kind, level, buffAtk, buffDef, buffHp, extra]) => ({
        name,
        x,
        y,
        kind,
        level,
        buffAtk,
        buffDef,
        buffHp,
        kingdom: extra?.k ?? null,
        amethystOverride: extra?.am ?? null,
        sapphireOverride: extra?.sap ?? null,
        notes: extra?.note ?? null,
      }),
    );

    // Chunked so the statement stays well inside SQLite's parameter limit.
    for (let i = 0; i < rows.length; i += 100) {
      tx.insert(nodes).values(rows.slice(i, i + 100)).run();
    }

    // Roads travel as index pairs into SEED_NODES; ids only exist after the
    // insert, and the tile is the one key both sides agree on.
    const idByTile = new Map(
      tx
        .select({ id: nodes.id, x: nodes.x, y: nodes.y })
        .from(nodes)
        .all()
        .map((n) => [`${n.x}:${n.y}`, n.id] as const),
    );
    const idAt = (i: number) => {
      const n = SEED_NODES[i];
      return n ? idByTile.get(`${n[1]}:${n[2]}`) : undefined;
    };

    const links = SEED_EDGES.flatMap(([a, b]) => {
      const aId = idAt(a);
      const bId = idAt(b);
      if (aId === undefined || bId === undefined || aId === bId) return [];
      const [x, y] = normalizePair(aId, bId);
      return [{ aId: x, bId: y }];
    });

    for (let i = 0; i < links.length; i += 200) {
      tx.insert(edges).values(links.slice(i, i + 200)).run();
    }
  }, { behavior: "immediate" });
}
