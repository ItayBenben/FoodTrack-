# Production deployment — state, operations, history

The record of how FoodTrack runs in production, how to operate it, and what went wrong on the way. Generic procedures (backup, restore, key rotation, passphrase reset) live in [`runbook.md`](runbook.md); this file is the production-specific layer on top. **No secrets in this file, ever** — they live only in the box's `/opt/foodtrack/.env`.

## 1. Where it runs

| | |
|---|---|
| URL | https://18-157-228-96.sslip.io (Caddy, automatic Let's Encrypt certificate) |
| Cloud | AWS, region `eu-central-1` (Frankfurt) |
| Instance | `travian-box` — `i-0c7d5a650b99b55e4`, t4g.small (arm64, 2 vCPU, 1.8 GB RAM), Ubuntu 24.04 |
| Disk | 30 GB gp3 (`vol-03dd992a3ccc0d911`), grown from 12 GB for the Docker images |
| Swap | 4 GB (`/swapfile` 2 GB + `/swapfile2` 2 GB) |
| Checkout | `/opt/foodtrack`, tracks `main` |
| Secrets | `/opt/foodtrack/.env` (mode 600) — DB passwords, session secret, KEK, Anthropic key |
| Shared with | `travian-partner.service` (unrelated, keep it running) |
| Cost | No new instance. Only delta: +18 GB disk ≈ $1.4/month, plus Anthropic API usage |

Why this shape: the owner asked for the cheapest option. Reusing an existing VM with Docker Compose and free TLS from Caddy costs essentially nothing extra. `abilities-as-dollar` (the previous occupant of ports 80/443) was removed at the owner's request; its backup is `/root/abilities-as-dollar-backup-20261114.tar.gz` on the box (code, systemd unit, old Caddyfile).

### Containers (`docker compose ps` in `/opt/foodtrack`)

`postgres` (18-alpine) · `api` (Fastify) · `worker` (job queue) · `analysis` (Python stats engine) · `web` (Next.js) · `caddy` (the only one publishing ports 80/443). All restart `unless-stopped`.

### Network

Security group `sg-06808688d9b7c3811`: 80 and 443 open to the world; 22 only from the owner's home IP and the owner's desktop VM. No SSH key from automation — remote commands go through **AWS Systems Manager** (below).

## 2. How to operate it

### Remote access without SSH

The instance has the IAM instance profile **`foodtrack-ssm`** (role with `AmazonSSMManagedInstanceCore`), so Run Command works:

- AWS console → Systems Manager → Run Command → `AWS-RunShellScript` → target `i-0c7d5a650b99b55e4`, or
- Session Manager for an interactive shell.

Gotchas learned the hard way:
- `AWS-RunShellScript` runs under **`sh`**, not bash. Wrap scripts: `bash <<'EOS' … EOS`.
- Long jobs (a build is 10–30 min on this box) must be detached: `setsid nohup bash script.sh > /var/log/x.log 2>&1 < /dev/null &`, then poll the log with short commands.
- Under build load the agent answers slowly; send the command, read the result in a separate call.
- Parameters of every Run Command are kept in SSM command history (~30 days) and visible to anyone with SSM access to the account. **Don't pass secrets as command text** unless you accept that; rotate them afterwards if you do.

### Deploy / upgrade — automatic

Every push to `main` that passes `ci` is deployed by `.github/workflows/deploy.yml`:

1. GitHub's OIDC token is exchanged for the role **`foodtrack-github-deploy`** (created by `infra/aws/github-deploy.yaml`, a one-time CloudFormation stack). Its only permission is SSM Run Command (`AWS-RunShellScript`) on this instance — no SSH, no stored keys.
2. The job runs `deploy-vm.sh` on the box via SSM with `DEPLOY_SHA` = the commit CI tested, waits for it (up to ~60 min), and prints the log tail.
3. Smoke test: `/` and `/api/v1/health` must return 200.

Re-deploy by hand from the Actions tab (`deploy` → *Run workflow*). Deploys never overlap (`concurrency: production`). Standing rule: merge green PRs and let this deploy them — see `CLAUDE.md`.

Manual fallback (only if Actions or the role is broken):

```bash
curl -fsSL https://raw.githubusercontent.com/ItayBenben/FoodTrack-/main/scripts/deploy-vm.sh -o /root/deploy-vm.sh
setsid nohup bash /root/deploy-vm.sh > /var/log/foodtrack-deploy.log 2>&1 < /dev/null &
grep '==>' /var/log/foodtrack-deploy.log      # progress: 1/7 … 7/7
```

The script is idempotent: it resets `/opt/foodtrack` to `origin/main`, keeps `.env`, rebuilds (cached layers make a code-only change ~5–10 min), runs migrations, skips key creation when a KEK exists, and restarts the stack. Faster path for an API-only change: `cd /opt/foodtrack && git pull && docker compose build api worker && docker compose up -d api worker`.

### Verify after a deploy

```bash
cd /opt/foodtrack
docker compose ps                                   # all healthy
curl -sS -o /dev/null -w '%{http_code}\n' https://18-157-228-96.sslip.io/   # 200
```

LLM check — runs the real router inside the api container (the dist chunk name changes per build, so find it):

```bash
cat > /tmp/llmcheck.mjs <<'EOF'
import fs from 'node:fs';
const f = fs.readdirSync('/repo/apps/api/dist').find((x) => x.startsWith('chunk-') && x.endsWith('.js')
  && fs.readFileSync('/repo/apps/api/dist/' + x, 'utf8').includes('function createLLMRouter'));
const d = await (await import('/repo/apps/api/dist/' + f)).boot();
console.log(JSON.stringify(d.llm.describe()));
const r = await d.llm.parseMeal({ locale: 'en', segments: [{ text: 'two slices of toast with butter', candidates: [] }] });
console.log(r.provider, r.degraded, JSON.stringify(r.items.map((i) => i.canonical_name)));
process.exit(0);
EOF
docker compose cp /tmp/llmcheck.mjs api:/tmp/llmcheck.mjs && docker compose exec -T api node /tmp/llmcheck.mjs
```

Expect `provider anthropic`, `degraded false`. `deterministic` / `true` means every remote call is failing and the app is silently on the offline fallback — the router swallows provider errors by design, so this check is the only way to see it.

### Anthropic key and model

In `/opt/foodtrack/.env`: `ANTHROPIC_API_KEY=…` and `ANTHROPIC_MODEL_TEXT=<model id>`. Photo reading is on (`config/llm.json` → `vision.enabled`) and uses the text model unless `ANTHROPIC_MODEL_VISION` is set. After changing either: `docker compose up -d api worker`. Rotate the key in the Anthropic console, replace it in `.env`, restart, then delete the old key. Meal parses take 4–6 s against an 8 s timeout (`config/llm.json`); if parses start degrading, pick a faster model rather than raising the timeout.

### Backups

Root's crontab: `0 3 * * * cd /opt/foodtrack && COMPOSE=1 BACKUP_DIR=/var/backups/foodtrack scripts/backup.sh >> /var/log/foodtrack-backup.log 2>&1`. Backups stay on the same disk — copy them off-box periodically (see `runbook.md`).

### Recovery card

Created at first install in `/root/foodtrack-recovery-card.txt`. It must be copied off the box and the file deleted there (`ssh ubuntu@<ip> 'sudo cat /root/foodtrack-recovery-card.txt'`, then `sudo rm` it). Without it, losing the server's `.env` means losing every encrypted field (meal text, notes, photos).

## 3. Known risks

- **No Elastic IP.** If the instance is stopped/started the public IP — and therefore the `sslip.io` hostname — changes. Fix: attach an Elastic IP, or use a real domain via `FOODTRACK_DOMAIN` and update `.env` + restart caddy.
- **Memory is tight.** 1.8 GB RAM shared with travian-partner; it leans on swap. Builds push load average to ~13. If it gets sluggish, the next step up is t4g.medium (4 GB).
- **Single box.** No replica; backups are the recovery path.

## 4. Deployment history (2026-11-14)

1. Inventoried the account read-only: one Linux VM (`travian-box`), one stopped Windows VM. Chose to reuse the Linux VM.
2. Created role + instance profile `foodtrack-ssm`, attached it; the SSM agent (snap, preinstalled) registered after a few minutes without a reboot.
3. Grew the EBS volume 12 → 30 GB, `growpart` + `resize2fs` online; added 2 GB swap.
4. Stopped/disabled/removed `abilities-as-dollar` and the system Caddy (backup tarball kept).
5. Ran `deploy-vm.sh`. Three bugs surfaced and were fixed (PR #2):
   - **apt lock**: the box was still running unattended-upgrades → Docker install failed. Script now sets `DPkg::Lock::Timeout "600"`.
   - **Inline comments in `.env.example`**: `FOODTRACK_KEK=   # …` was copied verbatim, so the "is the KEK set?" check saw a non-empty value, skipped `keys init`, and the API refused to boot (`kek_malformed`). Script now strips inline comments when generating `.env`. The API failing closed here is the intended L2 behaviour.
   - **LLM schema rejected**: the meal-parse JSON schema put `enum` on a `["string","null"]` type union; the structured-output API answers 400, and the router fell back to `deterministic` on every parse — invisible from the UI. Fixed with `anyOf`, plus `apps/api/test/llm-schema.test.ts` to keep it fixed.
6. Installed the Anthropic key in `.env`, verified English and Hebrew meal parsing go through Claude.
7. Merged PR #2, redeployed from `main`, re-verified.
8. Gallery photos (PR #4); photo reading turned on and continuous deployment added (I-29, I-30).

### 2026-11-16 — continuous deployment live

9. Created the CloudFormation stack `foodtrack-github-deploy` (eu-central-1) with `CreateOidcProvider=true` — the account had no GitHub OIDC provider.
10. First deploy failed with *Not authorized to perform sts:AssumeRoleWithWebIdentity*: this repo issues OIDC tokens with GitHub's **immutable subject** (`repo:ItayBenben@58786757/FoodTrack-@1362440115:environment:production`, see `gh api repos/ItayBenben/FoodTrack-/actions/oidc/customization/sub`), so the trust policy matching only `repo:ItayBenben/FoodTrack-:…` never matched. The template now accepts both forms; stack updated.
11. Deploy run 43822121710 green: `main` @ `184b559` live, smoke test passed. Gallery photos and photo reading are now in production.
12. Verified photo reading in the api container on a public-domain food photo (960×640, 23 foods): `vision: true`, provider anthropic, `degraded false`, sensible items — but it took **15.1 s against the 16 s photo timeout** (2 × `text.timeout_ms`). See §5.

## 5. Open follow-ups

- [ ] Rotate the Anthropic key (it passed through chat and SSM command history).
- [x] Copy the recovery card off the box and delete it there — done 2026-11-16 (owner holds it; shredded on the box).
- [ ] Attach an Elastic IP (or a real domain).
- [ ] Copy backups off-box on a schedule.
- [ ] Photo parsing is near its timeout (15.1 s of 16 s on a busy photo). A busy meal photo may silently come back `vision: unavailable`. Options: a faster model in `ANTHROPIC_MODEL_VISION`, downscaling images before the call, or a separate `vision.timeout_ms` — decide before raising any timeout (see "Anthropic key and model").
