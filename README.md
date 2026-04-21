# Diarization Demo

A Next.js application that records browser audio, sends it to `/api/transcribe`, and renders a diarized transcript with per-speaker styling.

The app now supports two execution modes behind the same UI:

- `google`: Google Cloud Speech-to-Text as a cloud baseline
- `whisperx`, `parakeet-pyannote`, `nemo`: local providers routed through a Python worker

## Recommended setup

For this project, the best practical local baseline is:

- Next.js stays as the browser and orchestration layer
- a separate Python worker handles local ASR and diarization
- start with `WhisperX + pyannote`
- compare against Google Cloud from the same recording flow

That architecture is the lowest-friction way to test different local models without trying to embed Python ML stacks inside a Next.js route.

## Current provider status

- `google`: implemented in the Node route
- `whisperx`: implemented in the local worker scaffold
- `parakeet-pyannote`: selectable in the UI and request path, worker implementation pending
- `nemo`: selectable in the UI and request path, worker implementation pending

## Current repo status

Today this repo is in the transition state between a single Google-only demo and a proper backend comparison harness:

- the frontend can select providers and models
- the Next.js route can dispatch to cloud or local backends
- Google remains the working baseline
- the local Python worker is in place
- WhisperX is the first local path to validate next
- Parakeet and NeMo are scaffolded for later implementation

## Project structure

```text
src/app/page.tsx                  Browser UI for recording and backend selection
src/app/api/transcribe/route.ts   Provider-dispatching Node route
src/lib/transcription.ts          Shared request validation and types
src/lib/google-transcription.ts   Google Cloud transcription adapter
src/lib/local-transcription.ts    HTTP adapter for the local Python worker
local-stt-worker/app.py           FastAPI worker for local models
docker-compose.local.yml          App + local worker development stack
```

## Requirements

- Node.js 20+
- npm
- Python 3.11+ if you want to run the local worker outside Docker
- `ffmpeg` for local WhisperX usage
- optional Google Cloud credentials if you want the cloud baseline
- a Hugging Face token with access to pyannote gated models for WhisperX diarization

## Environment setup

Copy the example file:

```bash
cp .env.example .env.local
```

Important variables:

- `TRANSCRIPTION_PROVIDER`: default backend for the route
- `LOCAL_TRANSCRIPTION_API_URL`: local worker base URL
- `GOOGLE_CLOUD_CREDENTIALS`: Google fallback credentials
- `LOCAL_STT_DEVICE`: `cpu` or `cuda` for the worker
- `WHISPERX_MODEL`: default Whisper model for the local worker
- `PYANNOTE_AUTH_TOKEN`: token used by WhisperX diarization

## Local development

### Option 1: Run Next.js locally and the worker in Docker

Start the app:

```bash
npm install
npm run dev
```

Start the local worker:

```bash
docker compose -f docker-compose.local.yml up local-stt-worker
```

### Option 2: Run both services with Docker Compose

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

Then open `http://localhost:3000`, allow microphone access, choose a backend and model, and record a short clip.

## Recommended evaluation flow

1. Keep one short two-speaker clip and reuse it.
2. Run `google` first as the baseline.
3. Switch to `whisperx` and compare `large-v3-turbo`, `large-v3`, and `distil-large-v3`.
4. Only after that add `parakeet-pyannote` or `nemo` worker implementations.

That sequence gives you a strong baseline quickly and keeps the comparisons clean.

## WhisperX notes

The worker uses WhisperX for:

- Whisper-family ASR
- alignment for better word timestamps
- pyannote-backed speaker diarization

The local worker expects `PYANNOTE_AUTH_TOKEN` because pyannote diarization models are gated on Hugging Face.

## Validation commands

- `npm run lint`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run verify`

Recommended local validation flow:

```bash
npm run verify
```

## Known constraints

- the browser still records short synchronous clips
- the local worker is where heavy models belong
- `parakeet-pyannote` and `nemo` are scaffolded but not yet implemented in `local-stt-worker/app.py`
- overlapping speech remains hard for all current local stacks

## Next steps for deeper model testing

If you want to expand this repo beyond the current baseline, the next useful additions are:

1. implement `parakeet-pyannote` in `local-stt-worker/app.py`
2. add a NeMo diarization path for `Sortformer` or `MSDD`
3. persist run metadata so you can compare multiple transcripts side by side
4. add a file-upload path so you can benchmark the same audio repeatedly instead of re-recording it
