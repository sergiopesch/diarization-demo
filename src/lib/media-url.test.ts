import { describe, expect, it } from "vitest";

import { getYouTubeEmbedUrl, isYouTubeUrl } from "./media-url";

describe("isYouTubeUrl", () => {
  it("identifies common YouTube link shapes", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc123")).toBe(true);
    expect(isYouTubeUrl("https://music.youtube.com/watch?v=abc123")).toBe(true);
  });

  it("does not classify direct media links as YouTube", () => {
    expect(isYouTubeUrl("https://example.com/interview.mp4")).toBe(false);
    expect(isYouTubeUrl("not-a-url")).toBe(false);
  });
});

describe("getYouTubeEmbedUrl", () => {
  it("builds embeddable URLs for supported YouTube link shapes", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/watch?v=abc_123-xyz")).toBe(
      "https://www.youtube.com/embed/abc_123-xyz?playsinline=1&rel=0"
    );
    expect(getYouTubeEmbedUrl("https://youtu.be/abc_123-xyz")).toBe(
      "https://www.youtube.com/embed/abc_123-xyz?playsinline=1&rel=0"
    );
    expect(getYouTubeEmbedUrl("https://youtube.com/shorts/abc_123-xyz")).toBe(
      "https://www.youtube.com/embed/abc_123-xyz?playsinline=1&rel=0"
    );
  });

  it("rejects non-YouTube and malformed YouTube URLs", () => {
    expect(getYouTubeEmbedUrl("https://example.com/interview.mp4")).toBeNull();
    expect(getYouTubeEmbedUrl("https://youtube.com/watch?v=x")).toBeNull();
  });
});
