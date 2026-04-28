# Hetzner Docker Deployment

This deployment runs the diarization app as its own Docker Compose project on
the same VPS as other stacks, with separate containers, network, env file, and
model cache volume.

## Target Shape

```text
public HTTPS
  -> reverse proxy
    -> diarization-demo:3000
    -> /worker/* -> local-stt-worker:8000

private Docker network
  -> diarization-demo
  -> local-stt-worker
  -> local-stt-model-cache volume
```

The worker port is not published directly. Protected worker endpoints require
`X-Worker-API-Key`.

## VPS Requirements

- x86_64 Ubuntu 22.04 or 24.04
- Docker Engine and Docker Compose plugin
- 4 vCPU, 8 GB RAM, and 80 GB disk recommended for CPU-only testing
- DNS `A` record pointing your app domain to the VPS
- Hugging Face token with accepted pyannote model terms

## Install Docker

On a fresh Ubuntu VPS:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Allow only SSH and HTTPS if this VPS is internet-facing:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Configure The Stack

Clone or copy this repository onto the VPS, then create the production env file:

```bash
cp .env.production.example .env.production
openssl rand -base64 48
```

Put the generated value in `LOCAL_WORKER_API_KEY`.

Minimum `.env.production` values:

```env
APP_DOMAIN=diarization.example.com
ACME_EMAIL=you@example.com
TRANSCRIPTION_PROVIDER=whisperx
LOCAL_TRANSCRIPTION_TIMEOUT_MS=600000
LOCAL_WORKER_API_KEY=replace-with-a-long-random-secret
ASSEMBLYAI_API_KEY=optional-for-hosted-live-diarization
LOCAL_STT_DEVICE=cpu
WHISPERX_MODEL=tiny.en
PYANNOTE_AUTH_TOKEN=replace-with-your-hugging-face-token
LOCAL_STT_MAX_AUDIO_BYTES=8388608
```

## Run With The Included Caddy Proxy

Use this if ports `80` and `443` are not already owned by OpenClaw or another
reverse proxy:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile proxy build
docker compose --env-file .env.production -f docker-compose.prod.yml --profile proxy up -d
```

The app will be available at:

```text
https://$APP_DOMAIN
```

The worker health endpoint will be available at:

```text
https://$APP_DOMAIN/worker/health
```

## Run Behind An Existing OpenClaw Proxy

If OpenClaw already owns ports `80` and `443`, do not start the `proxy` profile.
Start only the app and worker:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Then configure the existing proxy to route:

```text
/         -> diarization-demo:3000
/worker/* -> local-stt-worker:8000
```

The proxy must be attached to the `diarization-demo_default` Docker network, or
you must create an explicit shared proxy network and attach the services to it.
Keep the worker raw port unpublished.

## Warm The Model

From the VPS:

```bash
set -a
. ./.env.production
set +a

curl -sS -X POST "https://$APP_DOMAIN/worker/warmup" \
  -H "Content-Type: application/json" \
  -H "X-Worker-API-Key: $LOCAL_WORKER_API_KEY" \
  --data '{"model":"tiny.en","languageCode":"en-US"}'
```

Expected result after the pyannote token is configured:

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

If `diarizationLoaded` is `false`, the worker can load ASR/alignment but does
not have a usable `PYANNOTE_AUTH_TOKEN`.

## Useful Operations

View logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

Restart after env changes:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate
```

Update after pulling new code:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Check containers:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

## Vercel Option Later

If you move only the Next.js app to Vercel later, keep the worker on this VPS
and point Vercel at:

```env
LOCAL_TRANSCRIPTION_API_URL=https://diarization.example.com/worker
LOCAL_WORKER_API_KEY=the-same-worker-key
ASSEMBLYAI_API_KEY=your-assemblyai-key
```

Do not expose `PYANNOTE_AUTH_TOKEN` to the browser.
