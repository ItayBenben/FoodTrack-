#!/usr/bin/env bash
# One-shot install of FoodTrack on a single Linux VM (Ubuntu/Debian or Amazon Linux), the cheapest way to run it:
# Docker Compose on the box you already have, free TLS from Caddy. Idempotent: re-run it to upgrade.
#
#   curl -fsSL https://raw.githubusercontent.com/ItayBenben/FoodTrack-/main/scripts/deploy-vm.sh | sudo bash
#   sudo FOODTRACK_DOMAIN=food.example.com bash scripts/deploy-vm.sh      # with your own domain
#
# Without a domain it uses <public-ip>.sslip.io, which resolves to the VM and gets a real certificate.
# Needs inbound 80 and 443 open in the instance's security group.
set -euo pipefail
REPO="${REPO:-https://github.com/ItayBenben/FoodTrack-.git}"
BRANCH="${BRANCH:-main}"
DIR="${DIR:-/opt/foodtrack}"

log() { echo -e "\n==> $*"; }
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)"; exit 1; }

log "1/7 swap (small instances need it to build the images)"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [[ $MEM_MB -lt 3500 && ! -f /swapfile ]]; then
  fallocate -l 3G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "2/7 docker + git"
# a fresh VM is often still running unattended-upgrades: wait for the apt lock instead of failing
[[ -d /etc/apt/apt.conf.d ]] && echo 'DPkg::Lock::Timeout "600";' > /etc/apt/apt.conf.d/99foodtrack-lock-timeout
if ! command -v docker >/dev/null; then
  if command -v dnf >/dev/null || command -v yum >/dev/null; then
    (dnf install -y docker git || yum install -y docker git) >/dev/null
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    systemctl enable --now docker
  else
    apt-get update -qq && apt-get install -y -qq git curl ca-certificates >/dev/null
    curl -fsSL https://get.docker.com | sh >/dev/null
  fi
fi
command -v git >/dev/null || (apt-get install -y -qq git 2>/dev/null || dnf install -y git)

log "3/7 code"
if [[ -d $DIR/.git ]]; then git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" reset -q --hard "origin/$BRANCH"
else git clone -q -b "$BRANCH" "$REPO" "$DIR"; fi
cd "$DIR"

log "4/7 .env (secrets generated once, never overwritten)"
if [[ ! -f .env ]]; then
  IP=$(curl -fsS -m 3 -H "X-aws-ec2-metadata-token: $(curl -fsS -m 3 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)" http://169.254.169.254/latest/meta-data/public-ipv4 || curl -fsS -m 5 https://checkip.amazonaws.com)
  DOMAIN="${FOODTRACK_DOMAIN:-${IP//./-}.sslip.io}"
  rnd() { openssl rand -base64 32 | tr -d '/+=' | head -c 40; }
  cp .env.example .env
  sed -i "s|^POSTGRES_SUPERUSER_PASSWORD=.*|POSTGRES_SUPERUSER_PASSWORD=$(rnd)|; s|^FOODTRACK_DB_OWNER_PASSWORD=.*|FOODTRACK_DB_OWNER_PASSWORD=$(rnd)|; s|^FOODTRACK_DB_APP_PASSWORD=.*|FOODTRACK_DB_APP_PASSWORD=$(rnd)|;
          s|^SESSION_SECRET=.*|SESSION_SECRET=$(rnd)$(rnd)|; s|^FOODTRACK_DOMAIN=.*|FOODTRACK_DOMAIN=$DOMAIN|; s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=https://$DOMAIN|;
          s|^ANTHROPIC_MODEL_TEXT=.*|ANTHROPIC_MODEL_TEXT=|; s|^ANTHROPIC_MODEL_VISION=.*|ANTHROPIC_MODEL_VISION=|" .env
  chmod 600 .env
  echo "domain: $DOMAIN"
fi

log "5/7 build images (10–20 min on a small instance)"
docker compose build

log "6/7 database, keys, seed foods"
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U postgres -d foodtrack >/dev/null 2>&1; do sleep 2; done
docker compose run --rm -e WORKER_INPROCESS=false api node dist/cli/migrate.js up
if ! grep -q '^FOODTRACK_KEK=.\+' .env; then
  docker compose run --rm api node dist/cli/keys.js init --print-kek > /root/foodtrack-recovery-card.txt
  KEK=$(grep -o 'FOODTRACK_KEK=.*' /root/foodtrack-recovery-card.txt | head -1 | cut -d= -f2-)
  sed -i "s|^FOODTRACK_KEK=.*|FOODTRACK_KEK=$KEK|" .env
  chmod 600 /root/foodtrack-recovery-card.txt
  echo "RECOVERY CARD written to /root/foodtrack-recovery-card.txt — print it, store it off this machine, then delete the file."
fi
docker compose run --rm api node dist/cli/seed.js --foods-only

log "7/7 start"
docker compose up -d
docker compose ps
echo -e "\nFoodTrack: https://$(grep '^FOODTRACK_DOMAIN=' .env | cut -d= -f2)  (first visit runs setup)"
echo "Backups: add to root's crontab:  0 3 * * * cd $DIR && COMPOSE=1 BACKUP_DIR=/var/backups/foodtrack scripts/backup.sh"
