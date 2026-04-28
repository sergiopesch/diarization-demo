import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LocalTranscriptionServiceError,
  transcribeWithLocalService,
} from "./local-transcription";
import type { NormalizedTranscriptionRequest } from "./transcription";

const request: NormalizedTranscriptionRequest = {
  audioContent: "YXVk",
  provider: "whisperx",
  model: "large-v3-turbo",
  languageCode: "en-US",
  speakerCount: 2,
};

describe("transcribeWithLocalService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns normalized local worker responses", async () => {
    vi.stubEnv("LOCAL_TRANSCRIPTION_API_URL", "http://worker.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          transcriptionData: [{ word: "hello", speaker: 1 }],
          model: "large-v3-turbo",
        })
      )
    );

    await expect(transcribeWithLocalService(request)).resolves.toEqual({
      transcriptionData: [{ word: "hello", speaker: 1 }],
      model: "large-v3-turbo",
    });
  });

  it("uses the local development URL when no URL is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        transcriptionData: [],
        model: "large-v3-turbo",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await transcribeWithLocalService(request);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:8000/transcribe"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends the configured worker API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        transcriptionData: [],
        model: "tiny.en",
      })
    );
    vi.stubEnv("LOCAL_TRANSCRIPTION_API_URL", "http://worker.test");
    vi.stubEnv("LOCAL_WORKER_API_KEY", "test-worker-key");
    vi.stubGlobal("fetch", fetchMock);

    await transcribeWithLocalService(request);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://worker.test/transcribe"),
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Worker-API-Key": "test-worker-key",
        },
      })
    );
  });

  it("preserves actionable worker error status and detail", async () => {
    vi.stubEnv("LOCAL_TRANSCRIPTION_API_URL", "http://worker.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { detail: "provider is not implemented" },
          { status: 501 }
        )
      )
    );

    await expect(transcribeWithLocalService(request)).rejects.toMatchObject({
      message: "provider is not implemented",
      statusCode: 501,
    });
  });

  it("handles non-json service failures", async () => {
    vi.stubEnv("LOCAL_TRANSCRIPTION_API_URL", "http://worker.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response("upstream failure", {
            status: 502,
            statusText: "Bad Gateway",
          })
        )
      )
    );

    const result = transcribeWithLocalService(request);

    await expect(result).rejects.toBeInstanceOf(LocalTranscriptionServiceError);
    await expect(result).rejects.toMatchObject({
      message: "Local transcription service returned 502 Bad Gateway",
      statusCode: 502,
    });
  });
});
