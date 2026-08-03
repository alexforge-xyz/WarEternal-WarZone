import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * War Eternal — WarZone map data.
 *
 * Two tables only: the objects on the map and the roads between them.
 * Everything strategic (frontier, routes, income) is derived from these at
 * read time, so the data entered by hand stays the single source of truth.
 */

/** Object kinds. `base` is a kingdom's home base and always carries `kingdom`. */
export const NODE_KINDS = ["city", "gate", "turret", "castle", "base"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/**
 * A kingdom is referenced by its row id everywhere — `nodes.owner`,
 * `nodes.kingdom`, `changes.fromOwner/toOwner`. The id is an internal slot and
 * never changes; the in-game number beside it is a label an admin edits when a
 * new event puts a different line-up on the same map.
 */
export type Kingdom = number;

/**
 * Who is fighting on this map. Four of them in a normal WarZone, but the count
 * is not baked in: everything renders from this table.
 */
export const kingdoms = sqliteTable(
  "kingdoms",
  {
    /**
     * Stable slot. Seeded as 6/18/26/35 so ownership recorded before kingdoms
     * became editable keeps pointing at the right row.
     */
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** The number the game shows. Editable, and unique so tallies stay legible. */
    number: integer("number").notNull(),

    /** Shown instead of "Kingdom N" when set — an alliance name, usually. */
    name: text("name"),

    /** Hex, used for the map dots, the owner buttons and the scoreboard. */
    color: text("color").notNull(),

    /** Display order in the pickers; ties fall back to id. */
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("kingdoms_number").on(t.number)],
);

export type KingdomRow = typeof kingdoms.$inferSelect;

export const nodes = sqliteTable(
  "nodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),

    /** In-game coordinates. */
    x: integer("x").notNull(),
    y: integer("y").notNull(),

    kind: text("kind").$type<NodeKind>().notNull(),

    /**
     * Which kingdom this object *belongs to by design* — a `kingdoms.id`, set
     * for `base`, left null for neutral map objects.
     */
    kingdom: integer("kingdom").$type<Kingdom>(),

    level: integer("level").notNull().default(1),

    /** Buffs granted while held, in percent. They stack additively. */
    buffAtk: real("buff_atk").notNull().default(0),
    buffDef: real("buff_def").notNull().default(0),
    buffHp: real("buff_hp").notNull().default(0),

    /**
     * Crystal yield is derived from kind + level (see `lib/crystals.ts`), so
     * these stay null for almost every node. Set one only where the map
     * breaks the rule — the value then wins over the derived one.
     */
    amethystOverride: integer("amethyst_override"),
    sapphireOverride: integer("sapphire_override"),

    /** Who holds it right now — a `kingdoms.id`, null = nobody. */
    owner: integer("owner").$type<Kingdom>(),

    /**
     * When a person last confirmed this node on the map — set both by an
     * ownership change and by a plain "still the same" confirmation.
     * null = never checked. Drives the staleness marker.
     */
    checkedAt: integer("checked_at"),

    /**
     * Absolute unix time the shield drops, not a duration: every client counts
     * down to the same instant regardless of when its page was loaded.
     * null or in the past = no shield.
     */
    shieldUntil: integer("shield_until"),

    notes: text("notes"),

    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    // One object per tile — catches the most common data-entry mistake,
    // entering the same place twice.
    uniqueIndex("nodes_xy").on(t.x, t.y),
    index("nodes_kind").on(t.kind),
  ],
);

/**
 * Roads. Undirected: the pair is always stored with the smaller id in `aId`
 * (see `normalizePair`), which lets the unique index reject duplicates
 * regardless of the order the two nodes were clicked in.
 */
export const edges = sqliteTable(
  "edges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    aId: integer("a_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    bId: integer("b_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("edges_pair").on(t.aId, t.bId),
    index("edges_b").on(t.bId),
  ],
);

/**
 * Append-only record of who changed what. Attribution is a self-declared
 * nickname, not an authenticated identity — enough for coordination among
 * officers, and it also shows how fast the enemy is expanding.
 */
export const changes = sqliteTable(
  "changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nodeId: integer("node_id")
      .notNull()
      .references(() => nodes.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ChangeKind>().notNull(),
    fromOwner: integer("from_owner").$type<Kingdom>(),
    toOwner: integer("to_owner").$type<Kingdom>(),
    by: text("by"),
    at: integer("at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("changes_at").on(t.at), index("changes_node").on(t.nodeId)],
);

export const CHANGE_KINDS = ["owner", "confirm", "shield"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export type ChangeRow = typeof changes.$inferSelect;

/* ------------------------------ accounts ------------------------------ */

/** Roles an actual account can hold — `guest` is the absence of a session. */
export const ACCOUNT_ROLES = ["helper", "officer", "admin"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/**
 * There is no open sign-up: an account only comes into existence by consuming
 * a one-time invite, which keeps the table free of junk registrations.
 */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nick: text("nick").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<AccountRole>().notNull(),
    invitedBy: text("invited_by"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
    lastSeenAt: integer("last_seen_at"),
    /** Set instead of deleting, so the change log keeps pointing somewhere. */
    disabledAt: integer("disabled_at"),
    disabledBy: text("disabled_by"),
  },
  (t) => [uniqueIndex("users_nick").on(t.nick)],
);

export const invites = sqliteTable(
  "invites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    token: text("token").notNull(),
    role: text("role").$type<AccountRole>().notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    usedBy: text("used_by"),
  },
  (t) => [uniqueIndex("invites_token").on(t.token)],
);

/** Who did what to the accounts — separate from map `changes`. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actor: text("actor"),
    action: text("action").notNull(),
    detail: text("detail"),
    at: integer("at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("audit_at").on(t.at)],
);

export type UserRow = typeof users.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;

export type NodeRow = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
export type EdgeRow = typeof edges.$inferSelect;

/** Order a node pair so an undirected road has exactly one representation. */
export function normalizePair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}
