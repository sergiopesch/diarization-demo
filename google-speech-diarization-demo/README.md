# Google Speech Diarization Demo

A small Next.js demo that records browser audio, sends it to Google Cloud Speech-to-Text, and renders a diarized transcript with per-speaker coloring.

## What It Does

- Records microphone input with `MediaRecorder`
- Uploads WebM/Opus audio to `/api/transcribe`
- Calls Google Cloud Speech-to-Text with speaker diarization enabled
- Renders each recognized word with a speaker-specific color

## Requirements

- Node.js 18+
- A Google Cloud project with Speech-to-Text enabled
- Credentials available through one of these approaches:
  - `GOOGLE_CLOUD_CREDENTIALS` containing the full service-account JSON
  - Application Default Credentials configured in the runtime environment

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Provide credentials:

```bash
export GOOGLE_CLOUD_CREDENTIALS='{"type":"service_account",...}'
```

3. Start the dev server:

```bash
npm run dev
```

4. Open `http://localhost:3000`, allow microphone access, record a short clip, then stop the recording to trigger transcription.

## Available Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Notes

- The demo currently requests diarization for two speakers.
- The API handler reads the final recognition result for speaker-tagged words, which matches Google Cloud's diarization behavior for non-streaming requests.
- Browser support depends on `MediaRecorder` support for `audio/webm`.
