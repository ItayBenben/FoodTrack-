# FoodTrack — operator runbook

Everything here runs on the machine that hosts FoodTrack. Two entries — **passphrase reset** and **restore** — must be
tried once before the first real week of use: an untested recovery path is not a recovery path.

## 0. Cheapest: one VM you already have

```bash
curl -fsSL https://raw.githubusercontent.com/ItayBenben/FoodTrack-/main/scripts/deploy-vm.sh | sudo bash
```

Adds swap on small instances, installs Docker, generates every secret, builds, migrates, creates the keys (recovery card in `/root/foodtrack-recovery-card.txt`), seeds foods and starts. Without a domain it serves `https://<ip-with-dashes>.sslip.io` with a real certificate. Open ports 80 and 443 in the security group. The current production install, its AWS resources and operating notes are in [`deployment.md`](deployment.md).

## 1. First install (manual)

```bash
cp .env.example .env            # fill in passwords, SESSION_SECRET (openssl rand -base64 32), FOODTRACK_DOMAIN
docker compose up -d postgres
docker compose run --rm api pnpm keys init     # writes FOODTRACK_KEK into .env and prints the RECOVERY CARD once
docker compose run --rm api pnpm db:seed --foods-only
docker compose up -d
```

Print the recovery card. Keep it **off this machine and not with the backups**. Anyone holding the card *and* a database
dump can read the encrypted fields; without the card, a lost KEK means the encrypted fields are gone.

Optional: `docker compose run --rm api pnpm vapid` → paste `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` into `.env` for push reminders.
Optional: set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL_TEXT` for model-assisted meal parsing; without them the deterministic
provider is used and everything still works.

## 2. Forgotten passphrase

The passphrase is an auth credential, not an encryption key. Nothing is lost.

```bash
docker compose exec api sh -c 'wget -qO- --post-data= http://127.0.0.1:4000/api/v1/auth/reset-passphrase'
# → {"token": "…"}; open https://<domain>/reset#<token> within 15 minutes, or:
curl -X POST http://127.0.0.1:4000/api/v1/auth/reset-passphrase/<token> -H 'content-type: application/json' -d '{"passphrase":"new long passphrase"}'
```

The endpoint answers only on loopback/the Docker network and is refused by Caddy by path — two independent controls.
It revokes all sessions and touches no data.

## 3. Keys

| Command | What it does |
|---|---|
| `pnpm keys:check` | unwrap → encrypt → decrypt → compare. Run after any restore. |
| `pnpm keys:show` | reprint the card (needs the current KEK). |
| `pnpm keys:verify card.txt` | confirm a printed card unwraps the live data key. |
| `pnpm keys:rotate-kek` | new KEK, re-wraps the DEK, writes `.env`. **Old cards stop working — print the new one.** |

If the API refuses to start with `kek_mismatch`, the `.env` KEK is wrong for this database: restore it from the card.
It never falls back to plaintext.

## 4. Backups

```bash
COMPOSE=1 BACKUP_DIR=/srv/backups AGE_RECIPIENT=age1… scripts/backup.sh     # cron nightly
```

Ship `/srv/backups` to a different provider than the VPS. Keep 14 days locally.

## 5. Restore

```bash
AGE_IDENTITY=key.txt TARGET_DB_URL=postgres://foodtrack:…@localhost/foodtrack MEDIA_DIR=/data/media scripts/restore.sh foodtrack-…tar.gz.age
# put the card's KEK into .env as FOODTRACK_KEK, then
docker compose up -d && docker compose exec api pnpm keys:check
```

**Drill** (also in CI): `SOURCE_DB_URL=… MEDIA_DIR=… CARD=card.txt scripts/restore-drill.sh` restores into a scratch
database and proves a meal's text and a photo decrypt with only the card.

## 6. Hardening checklist (06 §5.5)

- Only Caddy publishes ports (`node scripts/compose-lint.mjs` enforces it).
- SSH key-only, no root login; ideally reach the host over Tailscale/WireGuard only.
- Unattended security upgrades; rebuild images on a schedule.
- Turn on TOTP in the app (More → Security) — this instance is reachable by anyone who finds the domain.
- Consider a Cloudflare Tunnel or a Tailscale-only bind so the origin has no public surface.

## 7. Health

`/health` is liveness only. `/health/ready` (internal network only) reports postgres, media, analysis, job queue and the
LLM provider.
