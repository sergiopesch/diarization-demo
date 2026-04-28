# Diarization Demo

A Next.js application that captures live audio, uploads short WebM audio, sends it to `/api/transcribe`, and renders a diarized transcript with per-speaker styling.

The app now supports two execution modes behind the same UI:

- `assemblyai`: hosted live streaming diarization over WebSocket
- `google`: Google Cloud Speech-to-Text as a cloud baseline
- `whisperx`: local ASR, alignment, and diarization routed through a Python worker
- `parakeet-pyannote`, `nemo`: scaffolded for future local worker implementations

## Recommended setup

For this project, the best practical local baseline is:

- Next.js stays as the browser and orchestration layer
- a separate Python worker handles local ASR and diarization
- start with `WhisperX + pyannote` using one CPU-friendly model, `tiny.en`
- compare against Google Cloud from the same recording flow

That architecture is the lowest-friction way to test different local models without trying to embed Python ML stacks inside a Next.js route.

## Current provider status

- `google`: implemented in the Node route
- `assemblyai`: implemented for live `System` and `Mic` capture through temporary streaming tokens
- `whisperx`: implemented in the local worker
- `parakeet-pyannote`: present in shared provider types and worker routing, disabled in the UI until implemented
- `nemo`: present in shared provider types and worker routing, disabled in the UI until implemented

## Current repo status

Today this repo is in the transition state between a single Google-only demo and a proper backend comparison harness:

- the frontend can select implemented providers and models
- the browser defaults to `assemblyai`, which is the deployment-safe Vercel mode
- chunked providers share the same live mic, live system/tab audio, and WebM upload transcription path
- AssemblyAI live capture streams audio continuously instead of using 6-second chunks
- detected speakers can be renamed in the transcript view
- the Next.js route can dispatch to cloud or local backends
- Google remains the working baseline
- the local Python worker is in place
- WhisperX is the first local path
- `tiny.en` is the only local ASR model exposed in the UI for now
- the worker validates decoded audio size, normalizes language codes for WhisperX, and caches loaded model components between requests
- Parakeet and NeMo are scaffolded for later implementation

## Project structure

```text
src/app/page.tsx                  Browser UI for live capture, upload, and backend selection
src/app/api/transcribe/route.ts   Provider-dispatching Node route
src/lib/transcription.ts          Shared request validation and types
src/lib/google-transcription.ts   Google Cloud transcription adapter
src/lib/local-transcription.ts    HTTP adapter for the local Python worker
local-stt-worker/app.py           FastAPI worker for local models
docker-compose.local.yml          App + local worker development stack
docker-compose.prod.yml           Production Compose stack for a Docker VPS
Caddyfile                         Optional HTTPS proxy for the production stack
```

## Requirements

- Node.js 24.x for Vercel/GitHub builds; Node.js 20.9+ also satisfies Next.js 16 locally
- npm
- Python 3.11+ if you want to run the local worker outside Docker
- `ffmpeg` for local WhisperX usage
- optional Google Cloud credentials if you want the cloud baseline
- a Hugging Face token with access to pyannote gated models for WhisperX diarization
- Docker if you want the recommended local worker path and persisted model cache

## Environment setup

Copy the example file:

```bash
cp .env.example .env.local
```

Important variables:

- `TRANSCRIPTION_PROVIDER`: default backend for the route
- `LOCAL_TRANSCRIPTION_API_URL`: local worker base URL; defaults to `http://127.0.0.1:8000` in local development when unset
- `LOCAL_TRANSCRIPTION_TIMEOUT_MS`: timeout for local worker requests
- `LOCAL_WORKER_API_KEY`: shared secret sent from the app to protected worker endpoints
- `ASSEMBLYAI_API_KEY`: server-side key used to mint temporary browser streaming tokens
- `GOOGLE_CLOUD_CREDENTIALS`: Google fallback credentials
- `LOCAL_STT_DEVICE`: `cpu` or `cuda` for the worker
- `WHISPERX_MODEL`: default Whisper model for the local worker
- `PYANNOTE_AUTH_TOKEN`: token used by WhisperX diarization
- `LOCAL_STT_MAX_AUDIO_BYTES`: decoded audio size limit enforced by the worker

### AssemblyAI key setup

For local testing, put the key in `.env.local`:

```bash
ASSEMBLYAI_API_KEY=your_new_key
```

Then restart the Next.js dev server so the API routes reload the environment.
Do not use a `NEXT_PUBLIC_` prefix; this key must stay server-side.

For Vercel, add the same variable name in the project environment settings:

```text
ASSEMBLYAI_API_KEY=your_new_key
```

Apply it to Production, Preview, and Development if you want the same behavior
across all deployments. Redeploy after adding or rotating the key.

## Vercel Deployment

The Vercel deployment is the hosted Next.js app only. The local WhisperX worker
does not run on Vercel; keep that worker on Docker/VPS if you need self-hosted
diarization. AssemblyAI live capture and direct media-link transcription work on
Vercel with only:

```text
ASSEMBLYAI_API_KEY=your_new_key
```

This repository includes `vercel.json` so Vercel uses
`npm ci --no-audit --no-fund --loglevel=error` and `npm run build`, and
`.vercelignore` so Docker files, docs, local worker code, and Playwright
artifacts are not uploaded with deployments.

The Vercel project setting controls the production Node.js version. The repo
does not set `engines.node`, so Vercel will honor the dashboard setting. `.nvmrc`
pins local and CI development to Node.js `24.14.1` to match the current Vercel
project setting.

If you want the Vercel app to call your VPS worker later, add these Vercel
environment variables too:

```text
LOCAL_TRANSCRIPTION_API_URL=https://your-domain.example/worker
LOCAL_WORKER_API_KEY=the-same-worker-secret
```

Do not add `PYANNOTE_AUTH_TOKEN` to Vercel unless the worker code is running
there, which this app intentionally avoids.

## Local development

### Option 1: Run Next.js locally and the worker in Docker

With this mode, keep `LOCAL_TRANSCRIPTION_API_URL=http://127.0.0.1:8000`
in `.env.local` because the Next.js process runs on your host.

Start the app:

```bash
npm install
npm run dev
```

Start the local worker:

```bash
docker compose -f docker-compose.local.yml up local-stt-worker
```

Compose stores Hugging Face, Torch, and related model files in the
`local-stt-model-cache` Docker volume so repeated worker restarts do not
redownload `tiny.en`.

### Option 2: Run both services with Docker Compose

With this mode, Compose overrides `LOCAL_TRANSCRIPTION_API_URL` to
`http://local-stt-worker:8000` for the app container. Do not use
`127.0.0.1` inside the app container for worker traffic. `.env.local` is
optional for Compose; values can also be provided through your shell
environment.

```bash
docker compose -f docker-compose.local.yml up
```

### Option 3: Run the worker directly in Python

```bash
cd local-stt-worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Then open `http://localhost:3000`, choose a backend and model, and start `System`, `Mic`, or `Upload`.

For system audio, the browser opens a screen-sharing picker. Select the tab,
window, or screen that is playing the interview and enable audio sharing in the
browser prompt. Browsers do not allow silent background capture of computer
audio.

## Recommended evaluation flow

1. Keep one short two-speaker WebM clip and reuse it.
2. Use `System` for a live interview or event playing on the computer.
3. Use `assemblyai` first for the simplest real live diarization path.
4. Run `google` as the upload/chunked baseline if credentials are configured.
5. Use `whisperx` / `tiny.en` when you want to compare against self-hosted local diarization.
6. Only after that add larger Whisper models, `parakeet-pyannote`, or `nemo` worker implementations.

That sequence gives you a strong baseline quickly and keeps the comparisons clean.

## AssemblyAI live streaming

AssemblyAI live mode is the easiest deployment path for real-time diarization.
The browser asks the Next.js API for a temporary token, opens a WebSocket to
AssemblyAI, streams PCM audio from `System` or `Mic`, and appends speaker turns
as they arrive. The long-lived `ASSEMBLYAI_API_KEY` stays on the server.

File upload remains handled by the existing `/api/transcribe` providers.
AssemblyAI in this app currently supports live capture and direct media links.

## AssemblyAI media links

The `Link` control accepts YouTube video links and direct public audio or video
file URLs.

YouTube links use live System-audio capture. Paste the link, press `Link`, play
the embedded clip, share this tab's audio when the browser asks, and watch
speaker turns appear as AssemblyAI receives the audio.

Direct media URLs such as `.mp4`, `.webm`, `.mp3`, `.wav`, or cloud-storage
media links are submitted directly to AssemblyAI async transcription with
`speaker_labels`.

Vimeo and article page URLs are not extracted by this app yet. Use System audio
while those pages play, or add a dedicated extractor later if the product needs
them.

## WhisperX notes

The worker uses WhisperX for:

- Whisper-family ASR
- alignment for better word timestamps
- pyannote-backed speaker diarization

The local worker expects `PYANNOTE_AUTH_TOKEN` because pyannote diarization models are gated on Hugging Face.
The worker fails fast when the token is missing, validates base64 audio before
writing a temporary file, maps locale-style language codes such as `en-US` to
WhisperX language codes such as `en`, and caches the WhisperX ASR, alignment,
and diarization components for repeated requests.

Warm the configured model before manual testing:

```bash
curl -X POST http://127.0.0.1:8000/warmup \
  -H "Content-Type: application/json" \
  --data '{"model":"tiny.en","languageCode":"en-US"}'
```

The warmup endpoint downloads and loads the ASR/alignment model. It also loads
the diarization pipeline when `PYANNOTE_AUTH_TOKEN` is present. Without that
token, warmup can still prepare ASR/alignment, but real diarization requests
will fail before transcription.

The Docker worker pins CPU-compatible Torch packages and `transformers==4.56.2`
because the current WhisperX release is sensitive to upstream ML dependency
versions.

## Validation commands

- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run typecheck`
- `npm run build`
- `npm run verify`

Recommended local validation flow:

```bash
npm run verify
```

## Docker VPS deployment

For a Hetzner VPS, use the production Compose stack in
`docker-compose.prod.yml`. It runs the Next app and local worker as separate
containers with a private Docker network and persistent model cache. The
included Caddy proxy is optional so this stack can coexist with OpenClaw or any
other reverse proxy already using ports `80` and `443`.

See `docs/deployment-hetzner.md` for the full server setup.
Use `docs/codex-hetzner-vps-build-spec.md` as a Codex prompt/spec when running
an assisted deployment session directly on the VPS.

## Evals

Recorded evals live in `docs/evals/`.

- `docs/evals/performance-2026-04-27.md`: app shell, API validation, and
  local-provider overhead against a mock worker.
- `docs/evals/end-to-end-2026-04-27.md`: browser E2E coverage for render,
  upload, live mic capture, and live system-audio capture against a mock worker.
- `docs/evals/real-worker-tiny-en-2026-04-28.md`: real Docker worker build and
  `tiny.en` warmup against the persisted model cache.

## Known constraints

- Google and local live transcription are chunked, not true token streaming
- Google and local live chunks are captured about every six seconds, then transcribed by the selected backend
- speaker labels can reset between chunks because each chunk is transcribed independently
- AssemblyAI live capture streams continuously and does not use the chunked path
- browser system-audio capture requires the user to explicitly share a tab/window/screen with audio
- the browser still handles short synchronous WebM clips for upload
- upload is intentionally limited to WebM audio because the current Google adapter is configured for WebM Opus
- the local worker is where heavy models belong
- the UI disables local providers whose worker paths are still pending
- `parakeet-pyannote` and `nemo` are scaffolded but not yet implemented in `local-stt-worker/app.py`
- overlapping speech remains hard for all current local stacks

## Next steps for deeper model testing

If you want to expand this repo beyond the current baseline, the next useful additions are:

1. configure `PYANNOTE_AUTH_TOKEN` and run a real `tiny.en` worker eval
2. add larger Whisper models after the CPU path is proven
3. implement `parakeet-pyannote` in `local-stt-worker/app.py`
4. add a NeMo diarization path for `Sortformer` or `MSDD`
5. persist run metadata so you can compare multiple transcripts side by side
6. add server-side transcoding if you need WAV, MP3, M4A, or Ogg uploads
