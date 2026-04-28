import { expect, test, type Page } from "@playwright/test";

test("renders the minimal live diarization surface", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Live diarization" })).toBeVisible();
  await expect(page.getByLabel("Backend")).toHaveValue("assemblyai");
  await expect(page.getByLabel("Model")).toHaveValue("u3-rt-pro");
  await expect(page.getByRole("button", { name: "System" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mic" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload" })).toBeDisabled();
  await expect(page.getByText("1. Paste an interview link.")).toBeVisible();
  await expect(page.getByText("2. Or use System/Mic audio.")).toBeVisible();
  await expect(page.getByText("3. Watch speaker turns appear.")).toBeVisible();
  await expect(page.getByText("No transcript")).toBeVisible();
});

test("uploads WebM audio and renders a diarized transcript", async ({ page }) => {
  await page.goto("/");
  await selectBackend(page, "whisperx");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "sample.webm",
    mimeType: "audio/webm",
    buffer: Buffer.from("mock-webm-audio"),
  });

  await expect(page.getByText("mock", { exact: true })).toBeVisible();
  await expect(page.getByText("transcript", { exact: true })).toBeVisible();
  await expect(page.getByText("sample.webm")).toBeVisible();
  await expect(page.getByText("2 words")).toBeVisible();
});

test("renames detected speakers in the transcript", async ({ page }) => {
  await page.goto("/");
  await selectBackend(page, "whisperx");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "sample.webm",
    mimeType: "audio/webm",
    buffer: Buffer.from("mock-webm-audio"),
  });

  await page.getByLabel("Name for S1").fill("Interviewer");
  await page.getByLabel("Name for S2").fill("Guest");

  await expect(page.getByText("Interviewer")).toHaveCount(2);
  await expect(page.getByText("Guest")).toHaveCount(2);
  await expect(page.getByText("mock", { exact: true })).toBeVisible();
  await expect(page.getByText("transcript", { exact: true })).toBeVisible();
});

test("rejects unsupported upload formats before calling the API", async ({
  page,
}) => {
  await page.goto("/");
  await selectBackend(page, "whisperx");

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "sample.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.from("mock-mp3-audio"),
  });

  await expect(page.getByText("Upload WebM audio.")).toBeVisible();
  await expect(page.getByText("No transcript")).toBeVisible();
});

test("captures microphone audio in live chunks", async ({ page }) => {
  await installMockMediaCapture(page);
  await page.goto("/");
  await selectBackend(page, "whisperx");

  await page.getByRole("button", { name: "Mic" }).click();

  await expect(page.getByText("Mic live", { exact: true })).toBeVisible();
  await expect(page.getByText("mock", { exact: true })).toBeVisible();
  await expect(page.getByText("transcript", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Ready")).toBeVisible();
});

test("captures shared system audio in live chunks", async ({ page }) => {
  await installMockMediaCapture(page);
  await page.goto("/");
  await selectBackend(page, "whisperx");

  await page.getByRole("button", { name: "System" }).click();

  await expect(page.getByText("System live")).toBeVisible();
  await expect(page.getByText("mock", { exact: true })).toBeVisible();
  await expect(page.getByText("transcript", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Ready")).toBeVisible();
});

test("streams live AssemblyAI diarization with speaker labels", async ({
  page,
}) => {
  await installMockMediaCapture(page);
  await page.route("/api/assemblyai/token", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ token: "mock-assembly-token" }),
    });
  });
  await page.goto("/");

  await expect(page.getByLabel("Model")).toHaveValue("u3-rt-pro");
  await installMockAssemblyAIStreaming(page);
  await page.getByRole("button", { name: "Mic" }).click();

  await expect(page.getByText("Mic live", { exact: true })).toBeVisible();
  await expect(page.getByText("hello", { exact: true })).toBeVisible();
  await expect(page.getByText("world", { exact: true })).toBeVisible();
  await expect(page.getByText("assemblyai", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("Ready")).toBeVisible();
});

test("transcribes a public media link with AssemblyAI diarization", async ({
  page,
}) => {
  let pollCount = 0;
  await page.route("/api/assemblyai/transcripts", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "mock-transcript-id",
        status: "queued",
        provider: "assemblyai",
        model: "universal-3-pro",
        transcriptionData: [],
      }),
    });
  });
  await page.route(
    "/api/assemblyai/transcripts/mock-transcript-id?model=universal-3-pro",
    async (route) => {
      pollCount += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "mock-transcript-id",
          status: pollCount > 1 ? "completed" : "processing",
          provider: "assemblyai",
          model: "universal-3-pro",
          transcriptionData:
            pollCount > 1
              ? [
                  { word: "link", speaker: 1 },
                  { word: "transcript", speaker: 2 },
                ]
              : [],
        }),
      });
    }
  );
  await page.goto("/");

  await page.getByLabel("Media URL").fill("https://example.com/interview.mp4");
  await page.getByRole("button", { name: "Link" }).click();

  await expect(
    page.getByText(/Submitting|Transcribing/)
  ).toBeVisible();
  await expect(page.getByText("link", { exact: true })).toBeVisible();
  await expect(page.getByText("transcript", { exact: true })).toBeVisible();
  await expect(page.getByText("https://example.com/interview.mp4")).toBeVisible();
});

test("uses live system audio for YouTube links", async ({ page }) => {
  await installMockMediaCapture(page);
  await page.route("/api/assemblyai/token", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ token: "mock-assembly-token" }),
    });
  });
  await page.goto("/");
  await installMockAssemblyAIStreaming(page);

  await page.getByLabel("Media URL").fill("https://youtu.be/mockInterview");
  await page.getByRole("button", { name: "Link" }).click();

  await expect(page.getByTitle("YouTube video player")).toHaveAttribute(
    "src",
    "https://www.youtube.com/embed/mockInterview?playsinline=1&rel=0"
  );
  await expect(page.getByText("System live")).toBeVisible();
  await expect(page.getByText("hello", { exact: true })).toBeVisible();
  await expect(page.getByText("world", { exact: true })).toBeVisible();
  await expect(page.getByText("https://youtu.be/mockInterview")).toBeVisible();
});

async function installMockMediaCapture(page: Page) {
  await page.addInitScript(() => {
    const createTrack = () => ({
      stop: () => undefined,
      onended: null,
    });
    const createStream = () => {
      const audioTrack = createTrack();
      const videoTrack = createTrack();

      return {
        getTracks: () => [audioTrack],
        getAudioTracks: () => [audioTrack],
        getVideoTracks: () => [videoTrack],
      };
    };

    class MockMediaRecorder {
      static isTypeSupported() {
        return true;
      }

      state = "inactive";
      ondataavailable: null | ((event: { data: Blob }) => void) = null;
      onerror: null | (() => void) = null;
      onstop: null | (() => void) = null;

      start() {
        this.state = "recording";
        window.setTimeout(() => {
          if (this.state !== "recording") {
            return;
          }

          this.ondataavailable?.({
            data: new Blob(["mock-live-audio"], { type: "audio/webm" }),
          });
        }, 50);
      }

      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => createStream(),
        getDisplayMedia: async () => createStream(),
      },
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: MockMediaRecorder,
    });
    Object.defineProperty(window, "MediaStream", {
      configurable: true,
      value: class {
        audioTracks: unknown[];

        constructor(audioTracks: unknown[]) {
          this.audioTracks = audioTracks;
        }

        getTracks() {
          return this.audioTracks;
        }

        getAudioTracks() {
          return this.audioTracks;
        }

        getVideoTracks() {
          return [];
        }
      },
    });
  });
}

async function selectBackend(page: Page, value: string) {
  await page.getByLabel("Backend").evaluate((select, nextValue) => {
    const element = select as HTMLSelectElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function installMockAssemblyAIStreaming(page: Page) {
  await page.evaluate(() => {
    const NativeWebSocket = window.WebSocket;

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 3;

      private nativeSocket: WebSocket | null = null;
      private mockReadyState = MockWebSocket.CONNECTING;
      private mockBinaryType: BinaryType = "blob";

      onopen: null | (() => void) = null;
      onmessage: null | ((event: { data: string }) => void) = null;
      onerror: null | (() => void) = null;
      onclose: null | (() => void) = null;

      constructor(url: string | URL, protocols?: string | string[]) {
        if (!url.toString().startsWith("wss://streaming.assemblyai.com")) {
          this.nativeSocket = new NativeWebSocket(url, protocols);
          return;
        }

        window.setTimeout(() => {
          this.mockReadyState = MockWebSocket.OPEN;
          this.onopen?.();
          window.setTimeout(() => {
            this.onmessage?.({
              data: JSON.stringify({
                type: "Turn",
                transcript: "hello world",
                speaker_label: "A",
                end_of_turn: true,
              }),
            });
          }, 20);
        }, 0);
      }

      get readyState() {
        return this.nativeSocket?.readyState ?? this.mockReadyState;
      }

      get binaryType() {
        return this.nativeSocket?.binaryType ?? this.mockBinaryType;
      }

      set binaryType(value: BinaryType) {
        if (this.nativeSocket) {
          this.nativeSocket.binaryType = value;
        }

        this.mockBinaryType = value;
      }

      send(data?: string | ArrayBufferLike | Blob | ArrayBufferView) {
        this.nativeSocket?.send(data ?? "");
        return undefined;
      }

      close() {
        if (this.nativeSocket) {
          this.nativeSocket.close();
          return;
        }

        this.mockReadyState = MockWebSocket.CLOSED;
        this.onclose?.();
      }

      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ) {
        this.nativeSocket?.addEventListener(type, listener);
      }

      removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ) {
        this.nativeSocket?.removeEventListener(type, listener);
      }
    }

    class MockAudioContext {
      sampleRate = 48000;

      createMediaStreamSource() {
        return {
          connect: () => undefined,
          disconnect: () => undefined,
        };
      }

      createScriptProcessor() {
        const processor = {
          onaudioprocess: null as null | ((event: {
            inputBuffer: { getChannelData: () => Float32Array };
          }) => void),
          connect: () => {
            processor.onaudioprocess?.({
              inputBuffer: {
                getChannelData: () => new Float32Array(4096),
              },
            });
          },
          disconnect: () => undefined,
        };

        return processor;
      }

      close() {
        return Promise.resolve();
      }
    }

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: MockWebSocket,
    });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: MockAudioContext,
    });
  });
}
