# Deploying FORAYS ERP to production

This is a step-by-step runbook for taking this repo from "runs on my
laptop" to "accessible securely from anywhere, over HTTPS, for the office
and site teams." It targets the simplest reliable setup for a team this
size: **one cloud VM, running the whole stack in Docker, with Caddy as
the public edge doing automatic HTTPS.**

If your organization already standardizes on AWS/Azure/GCP or wants a
managed PaaS (Render/Railway/Fly.io) instead, most of this still applies
— the two Dockerfiles and `docker-compose.prod.yml` are the reusable
part; only the "provision a server" and "point DNS" steps differ. Ask if
you want that variant written out instead.

---

## 0. What you'll end up with

```
Internet
   │  HTTPS (443), auto-renewed Let's Encrypt cert
   ▼
┌─────────────┐
│    Caddy    │  public edge — only container exposed to the internet
└──────┬──────┘
       │  routes by path, over a private Docker network
   ┌───┴────┐
   ▼        ▼
frontend  backend ──► postgres
 (nginx)  (Express)   (never exposed publicly)
```

Four containers (`postgres`, `backend`, `frontend`, `caddy`), one Docker
Compose file, one `.env`. No manual certificate handling — Caddy gets and
renews the TLS cert itself.

---

## 1. Prerequisites

- **A domain (or subdomain)** you control, e.g. `erp.foraysgroup.com`.
  You need access to its DNS settings to add one A record.
- **A cloud VM** — DigitalOcean, AWS Lightsail, Azure VM, Linode, etc.
  Minimum realistic size for this app: **2 vCPU / 4GB RAM**, 40GB+ disk,
  Ubuntu 22.04 or 24.04 LTS. (~$18–24/mo on most providers.) Go bigger if
  you expect 100+ concurrent users.
- **SSH access** to that VM.

## 2. Provision the server

1. Create the VM with your cloud provider of choice, Ubuntu 22.04/24.04.
2. Note its public IPv4 address.
3. SSH in: `ssh root@<server-ip>` (or your provider's default user).
4. Create a non-root user with sudo, and disable root SSH login / switch
   to key-based auth only — standard hardening, not app-specific:
   ```bash
   adduser deploy
   usermod -aG sudo deploy
   rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
   # then edit /etc/ssh/sshd_config: PermitRootLogin no, PasswordAuthentication no
   systemctl restart sshd
   ```
5. Firewall — only allow SSH, HTTP, and HTTPS in:
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
   Notice Postgres (5432) and the backend (4000) are **not** opened —
   they're only reachable from other containers on the internal Docker
   network, never from the internet, by design (see
   `docker-compose.prod.yml`).

## 3. Point DNS at the server

Add an **A record** for your chosen domain/subdomain pointing at the
server's public IP:

```
Type   Name                    Value
A      erp.foraysgroup.com     <server-ip>
```

Wait for it to propagate (`dig erp.foraysgroup.com` should return the
server's IP) before starting the stack — Caddy's certificate request
will fail otherwise.

## 4. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group change to take effect
docker --version
docker compose version
```

## 5. Get the code onto the server

```bash
git clone https://github.com/<your-org>/HR_App.git
cd HR_App
```

(Use an SSH deploy key or a fine-scoped access token if the repo is
private — GitHub's docs cover both; nothing app-specific here.)

## 6. Configure environment variables

```bash
cp .env.production.example .env
nano .env   # or vim/whatever
```

Fill in every value marked `CHANGE ME`:
- **`DOMAIN`** — the domain from step 3.
- **`DB_PASSWORD`** — a long random string (this is the database
  password, not any app login).
- **`JWT_ACCESS_SECRET`** / **`JWT_REFRESH_SECRET`** — two different long
  random strings. Generate with:
  ```bash
  openssl rand -base64 48
  ```
- **`SUPER_ADMIN_PASSWORD`** — the password for the first login. Change
  it again from inside the app immediately after your first login (this
  env var only controls the value used the very first time the account
  is created).
- SMTP/WhatsApp are optional — leave blank if you're not using bulk
  email/WhatsApp communication yet; everything else works fine without
  them.

`.env` is already gitignored — never commit it.

## 7. Build and start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First build takes a few minutes (compiling the frontend, installing
dependencies). Watch progress with:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

The backend container runs `prisma migrate deploy` automatically on
every start — your database schema is created/updated with no manual
migration step.

## 8. First-time data setup

Run the seed **once**, after the stack is up, to create the Super Admin
login:

```bash
docker compose -f docker-compose.prod.yml exec backend npm run seed
```

This is the same idempotent seed used in development — safe to re-run,
never duplicates data. It also creates a handful of sample
projects/roles/users (the same demo data described in `CLAUDE.md`). If
you don't want that demo data in your production system, either:
- delete/deactivate those sample projects and users from the UI after
  your first login (Super Admin → User Management / Settings), or
- edit `backend/prisma/seed.ts` before this step to only create the
  Super Admin account and skip the sample data, then rebuild
  (`docker compose -f docker-compose.prod.yml up -d --build backend`).

## 9. Verify

- Visit `https://<your-domain>` — you should see a valid padlock (Caddy's
  certificate) and the login page.
- Log in with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from your
  `.env`.
- **Change that password immediately** from the app's own profile/user
  management screen.
- Click through a few modules (Dashboard, Employees, Attendance) to
  confirm the API and database are wired up correctly.
- Check container health:
  ```bash
  docker compose -f docker-compose.prod.yml ps
  ```
  All four should show `healthy` (postgres/backend/frontend) or `Up`
  (caddy has no built-in healthcheck reported here, but its logs will
  show the certificate was issued).

## 10. Ongoing operations

### Deploying an update

```bash
cd HR_App
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

This rebuilds only what changed, applies any new Prisma migrations
automatically on backend start, and does a rolling restart. There's
inevitably a few seconds of downtime on the container(s) that changed —
fine for a team-internal app at this scale; ask if you want true
zero-downtime rolling deploys later (needs multiple backend replicas
behind Caddy's load balancer, a bit more setup).

### Viewing logs

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f caddy
```

### Database backups

Postgres data lives in a Docker named volume (`postgres_data`), which
survives container restarts/rebuilds but **not** a lost/reprovisioned
server. Set up a daily backup, e.g. a cron job on the host:

```bash
# /etc/cron.d/hr-app-backup
0 2 * * * root docker compose -f /home/deploy/HR_App/docker-compose.prod.yml exec -T postgres pg_dump -U hr_app hr_app_db | gzip > /var/backups/hr_app_$(date +\%Y\%m\%d).sql.gz
```

Adjust the path/user to match your `.env`, and ship the resulting
`.sql.gz` files off-server (S3, another machine, etc.) — a backup that
lives only on the server you're backing up isn't a real backup.

Restore with:
```bash
gunzip -c /var/backups/hr_app_YYYYMMDD.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U hr_app hr_app_db
```

### Uploaded files

Resumes, attachments, etc. live in the `backend_uploads` Docker volume.
Back this up too (`docker run --rm -v hr_app_backend_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads-backup.tar.gz -C /data .` or similar) — it's not covered by the Postgres dump.

### Rollback

```bash
git log --oneline   # find the commit to roll back to
git checkout <commit-sha>
docker compose -f docker-compose.prod.yml up -d --build
```

Note this rolls back application code, not database schema — Prisma
migrations are forward-only by default. If a bad deploy included a
destructive migration, restoring from the most recent backup (previous
step) is the safe path, not `git checkout` alone.

---

## Security checklist before go-live

Most of this is already handled in the app code (helmet, rate limiting,
bcrypt password hashing, JWT auth, `trust proxy` configured correctly
for running behind Caddy) — this list is the operational half:

- [ ] Changed `SUPER_ADMIN_PASSWORD` from the `.env` default, then
      changed it *again* via the app UI after first login.
- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are long, random, and
      different from each other (not left as the example placeholders).
- [ ] `.env` is not committed to git (already gitignored — just don't
      force-add it).
- [ ] Server firewall only allows 22/80/443 (step 2).
- [ ] SSH is key-based only, root login disabled (step 2).
- [ ] Postgres and the backend API are **not** published to the host
      (already true in `docker-compose.prod.yml` as written — don't add
      `ports:` to those two services).
- [ ] Automatic security updates enabled on the VM:
      `sudo apt install unattended-upgrades && sudo dpkg-reconfigure unattended-upgrades`
- [ ] A backup cron job is actually running and you've tested a restore
      at least once.
- [ ] Reviewed who has SSH access to the server and who holds the
      `.env` secrets.

## Optional: automatic deploys on push

`.github/workflows/ci.yml` already runs on every push/PR (typecheck +
build both projects) with no setup required.

`.github/workflows/deploy.yml` will SSH into your server and redeploy,
but is **manual-trigger only** until you add four secrets in this repo's
GitHub Settings → Secrets and variables → Actions — the workflow file
itself documents exactly what each one is and how to generate the deploy
key. Once they're set, uncomment the `push: branches: [main]` trigger in
that file to deploy automatically whenever main updates. Until then, run
it manually from the Actions tab ("Run workflow"), or just use the `git
pull && docker compose up -d --build` steps from section 10 by hand.

## Cost estimate (indicative)

| Item | Approx. cost |
|---|---|
| VM (2 vCPU/4GB) | $18–24/mo |
| Domain (if you don't have one) | $10–15/yr |
| TLS certificate | $0 (Let's Encrypt via Caddy) |
| Backups (off-server storage, e.g. S3) | $1–3/mo for this data size |

No other recurring costs unless you enable SMTP/WhatsApp providers,
which have their own pricing.
