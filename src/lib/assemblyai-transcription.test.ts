import { describe, expect, it } from "vitest";

import {
  formatAssemblyAIError,
  getAsyncModel,
  mapAssemblyAIUtterances,
  validateMediaUrl,
} from "./assemblyai-transcription";

describe("validateMediaUrl", () => {
  it("accepts public HTTPS media URLs", () => {
    expect(validateMediaUrl("https://example.com/interview.mp4")).toBeNull();
  });

  it("rejects missing, malformed, and non-HTTPS URLs", () => {
    expect(validateMediaUrl("")).toBe("Enter a public audio or video URL");
    expect(validateMediaUrl("not-a-url")).toBe("Enter a valid media URL");
    expect(validateMediaUrl("http://example.com/interview.mp4")).toBe(
      "Media URL must start with https://"
    );
  });

  it("rejects credentials, custom ports, and private hosts", () => {
    expect(validateMediaUrl("https://user:pass@example.com/interview.mp4")).toBe(
      "Media URL cannot include credentials"
    );
    expect(validateMediaUrl("https://example.com:8443/interview.mp4")).toBe(
      "Media URL must use the default HTTPS port"
    );
    expect(validateMediaUrl("https://localhost/interview.mp4")).toBe(
      "Media URL must be publicly reachable"
    );
    expect(validateMediaUrl("https://192.168.1.10/interview.mp4")).toBe(
      "Media URL must be publicly reachable"
    );
    expect(validateMediaUrl("https://[::1]/interview.mp4")).toBe(
      "Media URL must be publicly reachable"
    );
  });
});

describe("getAsyncModel", () => {
  it("only allows known async models", () => {
    expect(getAsyncModel("universal-2")).toBe("universal-2");
    expect(getAsyncModel("anything-else")).toBe("universal-3-pro");
  });
});

describe("formatAssemblyAIError", () => {
  it("turns HTML/audio mismatch errors into product guidance", () => {
    expect(formatAssemblyAIError("File type is text/html")).toMatch(
      /web page, not readable audio/
    );
    expect(formatAssemblyAIError("File does not appear to contain audio")).toMatch(
      /web page, not readable audio/
    );
  });
});

describe("mapAssemblyAIUtterances", () => {
  it("maps timed words and speaker labels", () => {
    expect(
      mapAssemblyAIUtterances([
        {
          speaker: "A",
          words: [
            { text: "hello", speaker: "A", start: 1000, end: 1500 },
            { word: "world", speaker: "B", start: 1600, end: 2100 },
          ],
        },
      ])
    ).toEqual([
      { word: "hello", speaker: 1, startSeconds: 1, endSeconds: 1.5 },
      { word: "world", speaker: 2, startSeconds: 1.6, endSeconds: 2.1 },
    ]);
  });

  it("falls back to utterance text when word timing is absent", () => {
    expect(mapAssemblyAIUtterances([{ speaker: "C", text: "hello again" }])).toEqual([
      { word: "hello", speaker: 3 },
      { word: "again", speaker: 3 },
    ]);
  });
});
