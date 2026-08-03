# War Eternal — WarZone

Conquest map for alliance officers during the WarZone event.
Author: **[K6] TheMrLordicus** · brand **alexforge**

Unofficial fan-made tool, **not affiliated** with the game publisher (ONEMT).
No official game assets are included — only original data and lucide icons
(ISC).

> Русская версия: [README_RU.md](./README_RU.md)

- Live: https://warzone.alexforge.xyz (after deploy)
- Source: https://github.com/alexforge-xyz/WarEternal-WarZone
- Legal: [/legal](https://warzone.alexforge.xyz/legal) · Privacy · Terms (EN)
- License: [MIT](./LICENSE)

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · SQLite + Drizzle ORM ·
lucide-react. No external backend services: the database is a file next to the
app.

## Run locally

```bash
npm install
```

```bash
npm run db:push
```

```bash
npm run dev
```

Open http://localhost:3000

## Screens

### `/` — Nodes

Create and edit map objects: name, coordinates, type (city / gate / turret /
main castle / kingdom base), level, buffs (attack / defence / HP in percent),
notes.

**Crystal yield is not entered by hand** — it is derived (see below).
**The map ships preloaded**: an empty database boots with 231 nodes and 352
roads, all unowned. Editing is admin-only; viewing is open.

After save, the form keeps the selected type and focuses the name field so
same-kind entries go faster. The **Links** column shows how many roads touch a
node; the **Unlinked** filter shows nodes with no roads yet.

### Kingdoms panel (admin)

The kingdom line-up changes between events, so it is edited here rather than
hard-coded: in-game number, custom name instead of “Kingdom N”, colour from the
palette, and which base the kingdom sits on. Renaming **does not drop
ownership** — everything references a stable internal slot, not the number.

Kingdoms can be added or removed. Nodes of a removed kingdom become unowned.

### `/links` — Roads

Nodes are laid out by coordinates. Click one node to select it, click a second
to add or remove a road; selection moves to the second node so chains are
fast. Click a line to delete that road.

- Wheel / pinch — zoom, drag — pan, Esc — clear selection
- **Fit** — frame the whole map
- **45°** — if the in-game grid runs diagonally (default on)
- **Y↕** — if the map looks vertically flipped

### How to read the map

A node is a coloured disc with an icon: colour is **who owns it**, icon is
**what it is**. Castle glyph — city, door — gate, tower — turret, flag —
kingdom base, **crown — main castle** (Throne) in the centre.

Labels depend on zoom so the overview stays readable:

| Zoom | Labels |
|---|---|
| close | name and level (plus shield timer) |
| mid / overview | level only |
| far | icons only |

**Buffs** (toggle on `/map`) answers a different question: not “what is this”
but “what does it give”. The node icon becomes the buff icon (swords — attack,
shield — defence, heart — HP), the label becomes the percent, and nodes with
no buff shrink so they do not clutter targeting.

## Crystals

Two types: **Amethyst** (purple) and **Sapphire** (blue). Yield is derived from
object kind and level:

| Level | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Per hour | 60 | 120 | 240 | 360 | 480 |

- **City** — one amethyst and one sapphire mine, both at the city’s level
- **Kingdom base** — sapphire level 1 only (60/h), no amethyst
- **Gate, turret, main castle** — no mines

Levels outside the table (the game has Lv.6 in places) show as `?`, not `0`,
and are counted separately under “Yield ?” so totals are not silently low.
Manual overrides use the “manual” control and are marked `*`.

When higher-level rates are known, edit the table in `lib/crystals.ts` — every
node recalculates without a migration.

## Languages

EN / RU / AR in the header. Arabic enables RTL. Choice is stored in a cookie;
first visit follows `Accept-Language`.

Dictionaries live in `lib/i18n.ts`. Russian is the key source; English and
Arabic are typed against it, so a missing translation fails the build.

## Mobile

Primary use is mid-match updates on a phone:

- cards instead of a wide table
- collapsible form so the list stays handy
- map sidebar as a bottom sheet
- pinch-zoom and touch targets ≥ 40px
- page zoom locked so two fingers move the map, not the whole UI

## Roles and access

| | guest | helper | officer | admin |
|---|---|---|---|---|
| Map, stats, nodes — view | ✓ | ✓ | ✓ | ✓ |
| Ownership, shields, “checked” | | ✓ | ✓ | ✓ |
| Team and invites | | | ✓ | ✓ |
| Edit nodes and roads | | | | ✓ |

No open registration: accounts are created only via a one-time
`/join/<token>` link (7 days, burned on use). Admins invite officers and
helpers; officers invite helpers only. The team list shows **who invited
whom**.

Officers can disable helpers; admins can disable anyone but themselves.
Disable takes effect immediately. Account actions are logged on `/team`.

First sign-in: while the user table is empty, `ADMIN_NICK` / `ADMIN_PASSWORD`
from `.env.local` bootstrap the admin. After that, env credentials are ignored.

Sign-in and join use Cloudflare Turnstile plus a rate limit. Without keys the
check is a no-op so local dev works.

## Data model

`db/schema.ts`:

- `kingdoms` — map line-up: number, name, colour. `id` is a permanent slot;
  ownership points at it, so renames stay safe
- `nodes` — map objects. Unique `(x, y)` catches double-entry of the same city.
  `owner` is who holds it now; `kingdom` is the designed base owner
- `edges` — roads. Pairs are stored as `aId < bId` (`normalizePair`) so
  duplicates cannot land from click order
- `changes` — ownership log; `users`, `invites`, `audit_log` — accounts

Static map data (nodes, roads, kingdoms) lives in `db/seed-data.ts` and fills
an empty database automatically. After UI edits, freeze the seed again with:

```bash
npm run db:export-seed
```

## Database

`warzone.db` next to the project (override with `SQLITE_PATH`). The file is
not in git — the map restores from seed; live ownership lives only in the DB.
Backup is a file copy.

## Deploy (DigitalOcean + Caddy)

Same droplet as other sites behind Caddy: dedicated subdomain, port **3002**,
own systemd unit. Step by step:

→ **[deploy/README.md](./deploy/README.md)**

Templates: `deploy/warzone.service`, `deploy/Caddyfile.snippet`.

Never commit `.env.local` or `*.db` — only code and the map seed.

## Not built yet

Capture planner (declaration rules needed first), three frontiers —
ours / theirs / contested, cost-aware routes with ROI, territory cut points.
