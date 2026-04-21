# Diarization Demo

This repository contains a Next.js demo for recording browser audio and transcribing it with Google Cloud Speech-to-Text speaker diarization.

## Repo Layout

```text
google-speech-diarization-demo/  Main application
```

## App

The application lives in [`google-speech-diarization-demo`](./google-speech-diarization-demo).

Key features:

- browser audio recording with `MediaRecorder`
- Google Cloud Speech-to-Text transcription
- speaker diarization with color-coded transcript output
- CI, tests, typecheck, and build validation

## Quick Start

```bash
cd google-speech-diarization-demo
npm install
npm run dev
```

For full setup instructions, environment configuration, validation commands, and deployment notes, see:

- [`google-speech-diarization-demo/README.md`](./google-speech-diarization-demo/README.md)
