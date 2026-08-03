import "server-only";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

/**
 * Single SQLite connection reused across hot-reloads in dev.
 * Path is configurable so the Droplet can point at a persistent location.
 */
const dbPath = process.env.SQLITE_PATH ?? "warzone.db";

const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
};

const sqlite =
  globalForDb.sqlite ??
  (() => {
    const conn = new Database(dbPath);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    // `next build` collects pages in parallel workers that all open this file.
    // Waiting a moment beats failing the build on a lock held for milliseconds.
    conn.pragma("busy_timeout = 5000");
    return conn;
  })();

if (process.env.NODE_ENV !== "production") globalForDb.sqlite = sqlite;

export const db = drizzle(sqlite, { schema });

// A fresh database comes up with the surveyed map already in it. Only fills
// tables that are empty, so this costs one count on every later start.
seedIfEmpty(db);

export { schema };
