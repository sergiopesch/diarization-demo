# Real Worker Eval - tiny.en - 2026-04-28

## Scope

This eval verifies the real Dockerized local worker dependency stack and model
warmup path for one CPU-friendly WhisperX model: `tiny.en`.

It does not claim full diarization quality yet because this environment does not
have `PYANNOTE_AUTH_TOKEN` configured. WhisperX diarization requires access to
the gated pyannote models on Hugging Face.

## Environment

- Worker image: `diarization-demo-local-stt-worker:latest`
- Worker URL: `http://127.0.0.1:8000`
- Device: CPU
- Compute type: `int8`
- Model cache: Docker volume `diarization-demo_local-stt-model-cache`
- ASR model: `tiny.en`

## Commands

```bash
docker compose -f docker-compose.local.yml build local-stt-worker
docker compose -f docker-compose.local.yml up -d --force-recreate local-stt-worker
curl -fsS http://127.0.0.1:8000/health
curl -sS -X POST http://127.0.0.1:8000/warmup \
  -H "Content-Type: application/json" \
  --data '{"model":"tiny.en","languageCode":"en-US"}'
```

## Warmup Result

```json
{
  "model": "tiny.en",
  "languageCode": "en",
  "device": "cpu",
  "computeType": "int8",
  "asrLoaded": true,
  "alignmentLoaded": true,
  "diarizationLoaded": false
}
```

## Transcription Boundary Check

A 1.5-second WebM tone was generated with `ffmpeg` and submitted to
`POST /transcribe` with provider `whisperx`, model `tiny.en`, and two speakers.

The worker returned the expected blocker:

```text
500 PYANNOTE_AUTH_TOKEN is required for WhisperX diarization.
```

This confirms the app no longer fails because of a missing local worker URL or
missing model dependency. The remaining blocker for full real diarization E2E is
the pyannote Hugging Face token and accepted gated model terms.

## Findings

- The real worker image builds successfully with CPU-only Torch packages.
- `torch`, `torchaudio`, and `torchvision` must all use matching CPU wheels.
- WhisperX is not compatible with the latest `transformers` release tested here;
  the worker pins `transformers==4.56.2`.
- The `tiny.en` ASR model and alignment model load successfully through the
  application-owned `/warmup` endpoint.
- Full diarized transcription remains intentionally blocked until
  `PYANNOTE_AUTH_TOKEN` is configured.

## Next Full E2E Step

Set `PYANNOTE_AUTH_TOKEN` in `.env.local`, restart the worker, rerun warmup, and
then repeat the browser system-audio flow against the real worker.
