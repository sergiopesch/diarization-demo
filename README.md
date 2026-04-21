# Diarization Demo

A Next.js demo that records browser audio, sends it to Google Cloud Speech-to-Text, and renders a diarized transcript with per-speaker coloring.

## Overview

This project is intentionally narrow in scope:

- the browser records microphone audio with `MediaRecorder`
- the client sends a base64-encoded WebM/Opus payload to `/api/transcribe`
- the server calls Google Cloud Speech-to-Text with diarization enabled
- the UI renders the returned words with speaker-specific colors

The demo is designed for short synchronous transcriptions, not long-running batch jobs.

## Project Structure

```text
src/app/page.tsx                 Browser UI for recording and transcript display
src/app/api/transcribe/route.ts  Server route that calls Google Cloud Speech
src/lib/transcription.ts         Shared request validation logic
src/lib/transcription.test.ts    Vitest coverage for validation rules
.github/workflows/ci.yml         CI validation workflow
```

## Requirements

- Node.js 20+
- npm
- A Google Cloud project with Speech-to-Text enabled
- Credentials available through one of these approaches:
  - `GOOGLE_CLOUD_CREDENTIALS` containing the full service-account JSON
  - Application Default Credentials configured in the runtime environment

## Environment Setup

Create local credentials in one of these ways.

### Option 1: Export credentials in your shell

```bash
export GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account",...}'
```

### Option 2: Use `.env.local`

```bash
cp .env.example .env.local
```

Then replace the placeholder JSON value with your real service-account payload.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open `http://localhost:3000`
4. Allow microphone access in the browser
5. Record a short clip and stop recording to trigger transcription

## Validation Commands

- `npm run lint`: ESLint
- `npm run test`: Vitest unit tests
- `npm run typecheck`: Next route type generation plus TypeScript validation
- `npm run build`: production build
- `npm run audit`: dependency audit at `high` severity or above
- `npm run verify`: canonical local validation flow

Recommended local workflow:

```bash
npm run verify
```

## How The Transcription Flow Works

1. The browser records audio with `MediaRecorder`.
2. The client converts the recorded blob to base64.
3. The client posts `{ audioContent }` to `/api/transcribe`.
4. The server validates the payload before calling Google Cloud Speech.
5. The server reads the final recognition result and extracts word-level speaker tags.
6. The UI renders the transcript with a color per detected speaker.

## API Behavior

`POST /api/transcribe`

Request body:

```json
{
  "audioContent": "<base64-webm-opus-audio>"
}
```

Successful response:

```json
{
  "transcriptionData": [
    { "word": "Hello", "speaker": 1 },
    { "word": "there", "speaker": 2 }
  ]
}
```

Error behavior:

- `400` for missing or malformed `audioContent`
- `413` for oversized payloads that exceed the synchronous-demo limit
- `500` for transcription failures or credential/runtime issues

## Operational Notes

- The demo currently requests diarization for two speakers.
- The API route is pinned to the Node.js runtime so the Google Cloud client is not deployed to an Edge runtime.
- Large uploads are rejected so the app stays on a simple synchronous transcription path.
- Browser support depends on `MediaRecorder` support for `audio/webm`.
- `next build` and `next typegen` both write under `.next`, so Next-based checks should be run sequentially in the same checkout.

## CI And Dependency Hygiene

GitHub Actions runs:

- lint
- test
- typecheck
- build
- dependency audit

Dependabot is configured to keep npm dependencies and GitHub Actions versions moving on a weekly cadence.

## Deployment Notes

This app is straightforward to deploy anywhere that supports a Next.js Node runtime.

Before deploying:

- provide `GOOGLE_CLOUD_CREDENTIALS` or equivalent ADC configuration
- ensure the runtime is Node.js, not Edge
- expect the demo route to be suitable for short audio clips, not large uploads or async batch processing

## Troubleshooting

### Microphone access fails

- confirm the browser has permission to use the microphone
- confirm the page is served in an environment where microphone access is allowed

### Transcription fails immediately

- verify Google Cloud Speech-to-Text is enabled
- verify the service-account credentials are valid
- verify `GOOGLE_CLOUD_CREDENTIALS` contains real JSON, not shell-escaped partial content

### Typecheck or build conflicts locally

- use `npm run verify`
- avoid running `npm run typecheck` and `npm run build` concurrently in the same checkout

## Future Improvements

- configurable speaker count
- async transcription path for larger files
- persisted transcript history
- e2e browser coverage for the recording flow
