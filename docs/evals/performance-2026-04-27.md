# Performance Eval - 2026-04-27

## Scope

This eval measures the Next.js app shell, API validation paths, and local-provider
request overhead. It does not measure real WhisperX model latency because the
local ML worker was not running with model dependencies and `PYANNOTE_AUTH_TOKEN`
in this environment.

## Environment

- App URL: `http://localhost:3001`
- App mode: `next dev`
- Mock local worker: `http://127.0.0.1:8000`
- Mock worker behavior: returns a fixed two-word diarized transcript after 75 ms
- Timestamp: `2026-04-27T22:49:24.308Z`

## Results

| Experiment | Runs | Status | Min | p50 | p95 | Max |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `GET /` app shell | 20 | `200` | 15 ms | 18 ms | 27 ms | 52 ms |
| Invalid base64 rejection | 20 | `400` | 3 ms | 4 ms | 7 ms | 20 ms |
| Unknown provider rejection | 20 | `400` | 3 ms | 3 ms | 4 ms | 4 ms |
| Local provider via mock worker, 32 KiB audio | 20 | `200` | 82 ms | 83 ms | 86 ms | 86 ms |
| Local provider via mock worker, 512 KiB audio | 10 | `200` | 92 ms | 93 ms | 108 ms | 108 ms |
| Oversized payload rejection | 3 | `413` | 78 ms | 80 ms | 86 ms | 86 ms |

Sequential live-chunk simulation:

- 5 sequential local-provider chunks against the mock worker completed in 422 ms.
- With the current 6-second browser chunk interval, the Next/API overhead should
  not be the bottleneck. Real ASR and diarization latency will dominate.

## Findings

- The app shell is responsive in dev mode, with p50 at 18 ms.
- Validation failures return quickly and avoid hitting the local worker.
- The local-provider adapter adds little overhead over the mock worker delay.
- Larger base64 payloads add measurable but modest overhead at 512 KiB.
- Oversized payload rejection is slower because the route still receives and
  parses the large JSON body before validation.

## Risks Before Manual Testing

- Real WhisperX latency is not covered here. First real local-worker startup will
  include model loading and may be slow even with caching.
- Live diarization is chunked, not true streaming. Results arrive after each
  chunk is recorded and processed.
- Speaker labels may reset between chunks because each chunk is diarized
  independently.
- Browser system-audio capture depends on the browser and OS. The user must
  select a tab/window/screen and enable audio sharing in the browser prompt.

## Recommended Next Evals

1. Run the same eval with the real local worker after `PYANNOTE_AUTH_TOKEN` is
   configured and models have warmed.
2. Measure first-chunk latency and warmed repeated-chunk latency separately.
3. Add an end-to-end browser test for the `System` capture permission flow where
   supported by the test environment.
4. Benchmark shorter chunk intervals only after measuring real worker throughput.
