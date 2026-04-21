import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRANSCRIPTION_PROVIDER,
  MAX_AUDIO_CONTENT_LENGTH,
  normalizeTranscriptionRequest,
  validateAudioContent,
} from "./transcription";

describe("validateAudioContent", () => {
  it("rejects missing audio content", () => {
    expect(validateAudioContent(undefined)).toBe("No audioContent provided");
  });

  it("rejects non-string audio content", () => {
    expect(validateAudioContent({})).toBe("audioContent must be a base64 string");
  });

  it("rejects oversized audio content", () => {
    expect(validateAudioContent("a".repeat(MAX_AUDIO_CONTENT_LENGTH + 1))).toBe(
      "Audio payload is too large for synchronous transcription"
    );
  });

  it("accepts a valid base64 payload", () => {
    expect(validateAudioContent("YXVk")).toBeNull();
  });
});

describe("normalizeTranscriptionRequest", () => {
  it("uses the fallback provider when none is supplied", () => {
    const { value, error } = normalizeTranscriptionRequest({
      audioContent: "YXVk",
    });

    expect(error).toBeNull();
    expect(value?.provider).toBe(DEFAULT_TRANSCRIPTION_PROVIDER);
  });

  it("accepts a local provider and model override", () => {
    const { value, error } = normalizeTranscriptionRequest({
      audioContent: "YXVk",
      provider: "whisperx",
      model: "large-v3-turbo",
      speakerCount: 2,
    });

    expect(error).toBeNull();
    expect(value).toMatchObject({
      provider: "whisperx",
      model: "large-v3-turbo",
      speakerCount: 2,
    });
  });

  it("rejects unknown providers", () => {
    const { value, error } = normalizeTranscriptionRequest({
      audioContent: "YXVk",
      provider: "unknown-provider",
    });

    expect(value).toBeNull();
    expect(error).toBe(
      "provider must be one of google, whisperx, parakeet-pyannote, nemo"
    );
  });
});
