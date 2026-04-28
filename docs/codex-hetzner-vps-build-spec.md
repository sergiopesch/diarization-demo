# Codex Build Spec: Hetzner VPS Deployment

Use this document inside a fresh Codex session while SSH'd into the Hetzner VPS
as `root`. Its purpose is to let Codex deploy this project as an isolated Docker
Compose stack on the same VPS as OpenClaw or other services.

## Mission

Deploy the diarization demo on a Hetzner VPS as separate containers:

```text
Hetzner VPS
  -> existing OpenClaw stack, if present
  -> diarization-demo stack
       -> diarization-demo Next.js app
       -> local-stt-worker FastAPI worker
       -> persistent local-stt-model-cache volume
       -> optional Caddy HTTPS proxy
```

The worker must not expose raw port `8000` publicly. The app and worker should
communicate over the private Docker network. Protected worker endpoints must
require `LOCAL_WORKER_API_KEY`.

## Non-Negotiables

- Do not break or remove OpenClaw containers, volumes, networks, proxy config,
  or env files.
- Do not expose `local-stt-worker:8000` directly to the public internet.
- Do not put `PYANNOTE_AUTH_TOKEN` in browser-visible code or logs.
- Do not use destructive Docker cleanup commands such as `docker system prune`
  unless the operator explicitly confirms it.
- Do not change SSH, firewall, or proxy rules until the current state has been
  inspected and recorded.
- Keep this app in its own directory and Compose project.

## Inputs To Collect From The Operator

Ask for these values if they are not already available:

```text
APP_DOMAIN=...
ACME_EMAIL=...
PYANNOTE_AUTH_TOKEN=...
ASSEMBLYAI_API_KEY=...
REPOSITORY_URL=...
BRANCH=...
```

If OpenClaw or another reverse proxy already owns ports `80` and `443`, ask
whether to integrate behind that proxy or use a separate subdomain through the
existing proxy. Do not start the included Caddy proxy profile if ports are
already in use.

If the operator wants only hosted AssemblyAI live diarization, the Docker worker
and `PYANNOTE_AUTH_TOKEN` are not required. In that case, prefer deploying the
Next.js app only to Vercel or another Node host with `ASSEMBLYAI_API_KEY`.

## Expected Repo Files

The repository should contain:

```text
Dockerfile
Caddyfile
docker-compose.prod.yml
.env.production.example
docs/deployment-hetzner.md
local-stt-worker/Dockerfile
local-stt-worker/app.py
```

If any are missing, stop and report which files are missing.

## Server Inspection

Run these first and summarize the result:

```bash
whoami
pwd
uname -a
cat /etc/os-release
docker --version || true
docker compose version || true
ss -tulpn | grep -E ':80|:443|:3000|:8000' || true
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
docker network ls
df -h
free -h
```

Decide which deployment mode to use:

- **Included Caddy mode**: use only if ports `80` and `443` are free.
- **Existing proxy mode**: use if OpenClaw or another proxy already owns ports
  `80` and `443`.

## Install Docker If Needed

If Docker is not installed on Ubuntu, install it:

```bash
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## Prepare App Directory

Use `/opt/diarization-demo` unless the operator requests a different path:

```bash
mkdir -p /opt
cd /opt
git clone "$REPOSITORY_URL" diarization-demo
cd /opt/diarization-demo
git checkout "$BRANCH"
```

If the directory already exists:

```bash
cd /opt/diarization-demo
git status --short
git fetch --all --prune
git checkout "$BRANCH"
git pull --ff-only
```

If `git status --short` shows local modifications, stop and ask before
overwriting anything.

## Create Production Env

Create `.env.production` from the example:

```bash
cp .env.production.example .env.production
WORKER_KEY="$(openssl rand -base64 48)"
```

Edit `.env.production` so it contains:

```env
APP_DOMAIN=your.domain.example
ACME_EMAIL=you@example.com
TRANSCRIPTION_PROVIDER=whisperx
LOCAL_TRANSCRIPTION_TIMEOUT_MS=600000
LOCAL_WORKER_API_KEY=generated-long-random-secret
ASSEMBLYAI_API_KEY=optional-for-hosted-live-diarization
GOOGLE_CLOUD_CREDENTIALS=
LOCAL_STT_DEVICE=cpu
WHISPERX_MODEL=tiny.en
PYANNOTE_AUTH_TOKEN=replace-with-your-hugging-face-token
LOCAL_STT_MAX_AUDIO_BYTES=8388608
```

Use file permissions:

```bash
chmod 600 .env.production
```

Do not print the full secret values in the final report.

## Validate Compose

Run both config checks:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config >/tmp/diarization-prod-config.yml
docker compose --env-file .env.production -f docker-compose.prod.yml --profile proxy config >/tmp/diarization-prod-proxy-config.yml
```

## Build

Build the app and worker:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

If using included Caddy mode:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile proxy build
```

## Start

### Mode A: Included Caddy

Only use this when ports `80` and `443` are free:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile proxy up -d
```

### Mode B: Existing OpenClaw Proxy

Use this when OpenClaw or another proxy already owns ports `80` and `443`:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Then configure the existing proxy to route:

```text
https://APP_DOMAIN/          -> diarization-demo:3000
https://APP_DOMAIN/worker/*  -> local-stt-worker:8000
```

The existing proxy must be attached to the `diarization-demo_default` Docker
network, or an explicit shared proxy network must be created and attached to
only the required services.

## Verify Runtime

Check containers:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=120
```

Check app through HTTPS:

```bash
curl -fsS "https://$APP_DOMAIN" >/tmp/diarization-home.html
wc -c /tmp/diarization-home.html
```

Check worker health:

```bash
curl -fsS "https://$APP_DOMAIN/worker/health"
```

Check worker protection. This must return `401`:

```bash
curl -sS -o /tmp/worker-no-key.out -w '%{http_code}' \
  -X POST "https://$APP_DOMAIN/worker/warmup" \
  -H "Content-Type: application/json" \
  --data '{"model":"tiny.en","languageCode":"en-US"}'
cat /tmp/worker-no-key.out
```

Warm the model with the key:

```bash
set -a
. ./.env.production
set +a

curl -sS -X POST "https://$APP_DOMAIN/worker/warmup" \
  -H "Content-Type: application/json" \
  -H "X-Worker-API-Key: $LOCAL_WORKER_API_KEY" \
  --data '{"model":"tiny.en","languageCode":"en-US"}'
```

Expected success after a valid pyannote token:

```json
{
  "model": "tiny.en",
  "languageCode": "en",
  "device": "cpu",
  "computeType": "int8",
  "asrLoaded": true,
  "alignmentLoaded": true,
  "diarizationLoaded": true
}
```

If `diarizationLoaded` is `false`, report that ASR/alignment warmed but
pyannote diarization did not load. Check the Hugging Face token and model terms.

## Optional Firewall

Before changing firewall state, inspect:

```bash
ufw status verbose || true
```

If the server is not already managed by another firewall system, allow SSH and
HTTPS only:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Do not block existing OpenClaw traffic without confirming its requirements.

## Final Report Format

Return a concise report with:

- deployment mode used: included Caddy or existing proxy
- app URL
- worker health result
- worker no-key protection result
- warmup result, with secrets redacted
- container status
- model cache volume name
- any unresolved blockers

Do not include full tokens, full env files, or private keys in the report.
