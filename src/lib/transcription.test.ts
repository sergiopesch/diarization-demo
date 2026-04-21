import { describe, expect, it } from "vitest";

import {
  MAX_AUDIO_CONTENT_LENGTH,
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
    expect(validateAudioContent("YXVk") ).toBeNull();
  });
});
