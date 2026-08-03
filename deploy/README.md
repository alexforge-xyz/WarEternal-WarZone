# Deploy on the existing DigitalOcean droplet (Caddy)

This app is meant to sit **next to** the two sites already reverse-proxied by
Caddy. It does **not** replace their Caddyfile blocks.

| Service | Typical port | Notes |
|---|---|---|
| Existing site A | `3000` | leave alone |
| Existing site B | `3001` | leave alone |
| **WarZone** | **`3002`** | this project |

**Hostname:** `warzone.alexforge.xyz`  
(`alexforge.xyz` itself may still 301 elsewhere for SEO — use a **subdomain**
so you do not break that redirect.)

Public repo: https://github.com/alexforge-xyz/WarEternal-WarZone

---

## 0. One-time server prerequisites

- Node.js **20+** (same major as the other Next apps is fine)
- `git`, `npm`, `build-essential` / Python headers if `better-sqlite3` needs to compile
- User that runs the apps (examples below use `deploy`)
- Caddy already managing HTTPS for the other vhosts

```bash
# example — only if native module build fails
sudo apt-get update
sudo apt-get install -y build-essential python3
```

---

## 1. DNS

In your DNS panel for `alexforge.xyz`:

```
warzone.alexforge.xyz.   A    <droplet-public-ip>
```

Optional: `www.warzone` CNAME → `warzone.alexforge.xyz`.

Wait until the name resolves before reloading Caddy (cert issuance needs it).

---

## 2. Clone and install (as deploy user)

```bash
sudo mkdir -p /var/www/warzone
sudo chown deploy:deploy /var/www/warzone

cd /var/www/warzone
git clone git@github.com:alexforge-xyz/WarEternal-WarZone.git .
# or: git clone https://github.com/alexforge-xyz/WarEternal-WarZone.git .

npm ci
```

SSH deploy key: add a **read-only** key for this repo on the droplet if the
box does not already have GitHub access. Do **not** put personal tokens in the
repo.

---

## 3. Environment (never commit this file)

```bash
nano /var/www/warzone/.env.local
```

Minimum production values:

```bash
NODE_ENV=production
PORT=3002
SQLITE_PATH=/var/www/warzone/data/warzone.db

# long random string — changing it signs everyone out
SESSION_SECRET=generate-a-long-random-string-here

# first boot only: creates the admin account, then ignored
ADMIN_NICK=[K6] TheMrLordicus
ADMIN_PASSWORD=use-a-strong-unique-password

# Cloudflare Turnstile (strongly recommended on a public host)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
```

```bash
mkdir -p /var/www/warzone/data
# ownership so the service user can write the SQLite file + WAL
chown -R deploy:deploy /var/www/warzone/data
```

Generate a secret, for example:

```bash
openssl rand -base64 48
```

---

## 4. Build

```bash
cd /var/www/warzone
npm run build
```

First start seeds an empty DB with the static map (unowned). Live ownership
stays only in `SQLITE_PATH` — back that file up.

---

## 5. systemd

```bash
sudo cp /var/www/warzone/deploy/warzone.service /etc/systemd/system/warzone.service
# edit User= / paths if needed
sudo systemctl daemon-reload
sudo systemctl enable --now warzone
sudo systemctl status warzone
```

Logs:

```bash
journalctl -u warzone -f
```

Smoke-test locally on the box:

```bash
curl -sI http://127.0.0.1:3002/map
```

---

## 6. Caddy (append, do not wipe)

**Do not** replace the whole Caddyfile. Append the WarZone block from
`deploy/Caddyfile.snippet`:

```bash
sudo nano /etc/caddy/Caddyfile
# paste the warzone.alexforge.xyz block at the end
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Confirm the other two sites still answer, then:

```bash
curl -sI https://warzone.alexforge.xyz/map
```

---

## 7. First login

1. Open `https://warzone.alexforge.xyz/login`
2. Sign in with `ADMIN_NICK` / `ADMIN_PASSWORD` from `.env.local` (bootstrap)
3. Change the password workflow is “invite a second admin / use team” — at
   minimum set a strong bootstrap password and do not reuse it elsewhere
4. Create invite links for officers/helpers on `/team`

After the admin row exists, env bootstrap credentials are **ignored**.

---

## 8. Updates (later deploys)

```bash
cd /var/www/warzone
git pull
npm ci
npm run build
sudo systemctl restart warzone
```

Database file is outside git (`data/warzone.db`) — `git pull` does not wipe
ownership. Still take a copy before big upgrades:

```bash
cp -a /var/www/warzone/data/warzone.db /var/www/warzone/data/warzone.db.bak-$(date +%F)
```

---

## 9. What must never land in git

| Path | Why |
|---|---|
| `.env` / `.env.local` | secrets |
| `*.db`, `*.db-shm`, `*.db-wal` | live map / accounts |
| invite tokens, backups of prod DB | operational secrets |

`.gitignore` already covers env and SQLite files.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Caddy cert fail | DNS A record, port 80 reachable, not proxied orange-cloud blocking HTTP-01 |
| 502 from Caddy | `systemctl status warzone`, app listening on **3002** |
| SQLITE_BUSY / empty map after crash | stop service, ensure only one process uses the DB file |
| `better-sqlite3` build error | install `build-essential`, rebuild with `npm rebuild better-sqlite3` |
| Other sites died after edit | restore previous Caddyfile from backup; always `caddy validate` first |
