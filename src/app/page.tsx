"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { getYouTubeEmbedUrl, isYouTubeUrl } from "@/lib/media-url";
import {
  MAX_AUDIO_CONTENT_LENGTH,
  type TranscriptWord,
  type TranscriptionProvider,
} from "@/lib/transcription";

type ProviderOption = {
  value: TranscriptionProvider;
  label: string;
  summary: string;
  status: "available" | "coming-soon";
  models: Array<{ value: string; label: string }>;
};

type CaptureMode = "idle" | "mic" | "system";

type ResultMeta = {
  provider: string;
  model: string;
  source: string;
};

type EmbeddedVideo = {
  sourceUrl: string;
  embedUrl: string;
};

type SpeakerNames = Record<number, string>;

type TranscriptionResponse = {
  transcriptionData?: TranscriptWord[];
  provider?: string;
  model?: string;
  error?: string;
};

type AssemblyAITranscriptResponse = {
  id?: string;
  status?: string;
  provider?: string;
  model?: string;
  transcriptionData?: TranscriptWord[];
  error?: string;
};

type AssemblyAITokenResponse = {
  token?: string;
  error?: string;
};

type AssemblyAIMessage = {
  type?: string;
  transcript?: string;
  speaker_label?: string;
  end_of_turn?: boolean;
  error?: string;
};

const LIVE_CHUNK_MS = 6_000;
const ASSEMBLYAI_SAMPLE_RATE = 16_000;
const LINK_POLL_INTERVAL_MS = 3_000;
const AUDIO_SIZE_ERROR = "Use a shorter audio file.";
const AUDIO_FORMAT_ERROR = "Upload WebM audio.";

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: "assemblyai",
    label: "AssemblyAI",
    summary: "Live",
    status: "available",
    models: [
      { value: "u3-rt-pro", label: "Universal-3 Pro" },
      { value: "universal-streaming-english", label: "Universal EN" },
      { value: "whisper-rt", label: "Whisper RT" },
    ],
  },
  {
    value: "google",
    label: "Google Speech",
    summary: "Cloud",
    status: "available",
    models: [{ value: "google-speech-default", label: "Default" }],
  },
  {
    value: "whisperx",
    label: "WhisperX",
    summary: "Local",
    status: "available",
    models: [{ value: "tiny.en", label: "tiny.en" }],
  },
  {
    value: "parakeet-pyannote",
    label: "Parakeet",
    summary: "Pending",
    status: "coming-soon",
    models: [
      { value: "nvidia/parakeet-unified-en-0.6b", label: "unified 0.6B" },
      { value: "nvidia/parakeet-tdt-0.6b-v2", label: "TDT 0.6B v2" },
    ],
  },
  {
    value: "nemo",
    label: "NeMo",
    summary: "Pending",
    status: "coming-soon",
    models: [
      { value: "sortformer", label: "Sortformer" },
      { value: "msdd+titanet", label: "MSDD + TitaNet" },
    ],
  },
];

const getProviderConfig = (provider: TranscriptionProvider): ProviderOption =>
  PROVIDER_OPTIONS.find((option) => option.value === provider) ??
  PROVIDER_OPTIONS[0];

const speakerTone = (speaker: number): string => {
  switch (speaker) {
    case 1:
      return "var(--speaker-one)";
    case 2:
      return "var(--speaker-two)";
    default:
      return "var(--speaker-other)";
  }
};

const defaultSpeakerLabel = (speaker: number): string =>
  speaker > 0 ? `S${speaker}` : "Unknown";

const getSpeakerLabel = (speaker: number, speakerNames: SpeakerNames): string => {
  const name = speakerNames[speaker]?.trim();
  return name || defaultSpeakerLabel(speaker);
};

const getSpeakerIds = (words: TranscriptWord[]): number[] =>
  Array.from(new Set(words.map((item) => item.speaker))).sort((a, b) => a - b);

const groupSpeakerTurns = (words: TranscriptWord[]) => {
  const turns: Array<{ speaker: number; words: TranscriptWord[] }> = [];

  words.forEach((word) => {
    const previous = turns.at(-1);

    if (previous && previous.speaker === word.speaker) {
      previous.words.push(word);
      return;
    }

    turns.push({ speaker: word.speaker, words: [word] });
  });

  return turns;
};

const speakerNumberFromAssemblyLabel = (label: string | undefined): number => {
  if (!label || label === "UNKNOWN") {
    return 0;
  }

  const firstLetter = label.trim().toUpperCase().charCodeAt(0);
  return firstLetter >= 65 && firstLetter <= 90 ? firstLetter - 64 : 0;
};

const wordsFromTurn = (
  transcript: string,
  speakerLabel?: string
): TranscriptWord[] => {
  const speaker = speakerNumberFromAssemblyLabel(speakerLabel);

  return transcript
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ word, speaker }));
};

export default function Home() {
  const [provider, setProvider] = useState<TranscriptionProvider>("whisperx");
  const [model, setModel] = useState(
    getProviderConfig("whisperx").models[0].value
  );
  const [captureMode, setCaptureMode] = useState<CaptureMode>("idle");
  const [processingCount, setProcessingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptWord[]>([]);
  const [partialTurn, setPartialTurn] = useState<TranscriptWord[]>([]);
  const [speakerNames, setSpeakerNames] = useState<SpeakerNames>({});
  const [resultMeta, setResultMeta] = useState<ResultMeta | null>(null);
  const [embeddedVideo, setEmbeddedVideo] = useState<EmbeddedVideo | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const assemblyWebSocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const submitQueueRef = useRef<Promise<void>>(Promise.resolve());
  const linkPollingCancelledRef = useRef(false);
  const chunkIndexRef = useRef(0);

  const processing = processingCount > 0;
  const live = captureMode !== "idle";
  const selectedProvider = getProviderConfig(provider);
  const displayedTranscription = useMemo(
    () => [...transcription, ...partialTurn],
    [partialTurn, transcription]
  );
  const activeSpeakerIds = useMemo(
    () => getSpeakerIds(displayedTranscription),
    [displayedTranscription]
  );
  const speakerTurns = useMemo(
    () => groupSpeakerTurns(displayedTranscription),
    [displayedTranscription]
  );

  useEffect(() => {
    return () => {
      linkPollingCancelledRef.current = true;
      closeAssemblyAIConnection();
      stopStream();
    };
  }, []);

  useEffect(() => {
    const nextModel = getProviderConfig(provider).models[0]?.value;

    if (nextModel) {
      setModel(nextModel);
    }
  }, [provider]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const selectProvider = (value: string) => {
    setProvider(value as TranscriptionProvider);
  };

  const resetResult = (options: { preserveVideo?: boolean } = {}) => {
    setError(null);
    setTranscription([]);
    setPartialTurn([]);
    setSpeakerNames({});
    setResultMeta(null);
    setLinkStatus(null);
    if (!options.preserveVideo) {
      setEmbeddedVideo(null);
    }
    chunkIndexRef.current = 0;
  };

  const updateSpeakerName = (speaker: number, name: string) => {
    setSpeakerNames((current) => ({
      ...current,
      [speaker]: name,
    }));
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String ?? "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const getAssemblyAIToken = async (): Promise<string> => {
    const response = await fetch("/api/assemblyai/token", {
      method: "POST",
      cache: "no-store",
    });
    const data = (await response.json()) as AssemblyAITokenResponse;

    if (!response.ok || !data.token) {
      throw new Error(data.error || "AssemblyAI token request failed");
    }

    return data.token;
  };

  const submitMediaUrl = async () => {
    const audioUrl = mediaUrl.trim();

    if (isYouTubeUrl(audioUrl)) {
      await startYouTubeLiveCapture(audioUrl);
      return;
    }

    try {
      resetResult();
      linkPollingCancelledRef.current = false;
      setProcessingCount((count) => count + 1);
      setLinkStatus("Submitting");

      const submitResponse = await fetch("/api/assemblyai/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl, model }),
      });
      const submitted = (await submitResponse.json()) as AssemblyAITranscriptResponse;

      if (!submitResponse.ok || !submitted.id) {
        throw new Error(submitted.error || "Link transcription failed");
      }

      setResultMeta({
        provider: "assemblyai",
        model: submitted.model ?? "universal-3-pro",
        source: audioUrl,
      });

      while (!linkPollingCancelledRef.current) {
        setLinkStatus("Transcribing");
        await wait(LINK_POLL_INTERVAL_MS);

        const statusResponse = await fetch(
          `/api/assemblyai/transcripts/${submitted.id}?model=${encodeURIComponent(
            submitted.model ?? model
          )}`,
          { cache: "no-store" }
        );
        const status = (await statusResponse.json()) as AssemblyAITranscriptResponse;

        if (!statusResponse.ok) {
          throw new Error(status.error || "Link transcription failed");
        }

        if (status.status === "error") {
          throw new Error(status.error || "AssemblyAI could not transcribe the link");
        }

        if (status.status === "completed") {
          setTranscription(status.transcriptionData ?? []);
          setResultMeta({
            provider: status.provider ?? "assemblyai",
            model: status.model ?? submitted.model ?? "universal-3-pro",
            source: audioUrl,
          });
          setLinkStatus(null);
          return;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link transcription failed");
      setLinkStatus(null);
    } finally {
      setProcessingCount((count) => Math.max(0, count - 1));
    }
  };

  const handleAssemblyAIMessage = (
    event: MessageEvent<string>,
    source: string,
    activeModel: string = model
  ) => {
    let data: AssemblyAIMessage;

    try {
      data = JSON.parse(event.data) as AssemblyAIMessage;
    } catch {
      return;
    }

    if (data.type === "Turn" && data.transcript) {
      const words = wordsFromTurn(data.transcript, data.speaker_label);

      if (data.end_of_turn) {
        setTranscription((current) => [...current, ...words]);
        setPartialTurn([]);
      } else {
        setPartialTurn(words);
      }

      setResultMeta({
        provider: "assemblyai",
        model: activeModel,
        source,
      });
    }

    if (data.type === "Error" || data.error) {
      setError(data.error || "AssemblyAI streaming failed");
    }
  };

  const closeAssemblyAIConnection = () => {
    const socket = assemblyWebSocketRef.current;

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "Terminate" }));
      socket.close();
    } else if (socket?.readyState === WebSocket.CONNECTING) {
      socket.close();
    }

    audioProcessorRef.current?.disconnect();
    audioSourceRef.current?.disconnect();
    void audioContextRef.current?.close();
    assemblyWebSocketRef.current = null;
    audioContextRef.current = null;
    audioProcessorRef.current = null;
    audioSourceRef.current = null;
  };

  const startAssemblyAIStreaming = async (
    mode: Exclude<CaptureMode, "idle">,
    options: {
      modelOverride?: string;
      preserveVideo?: boolean;
      source?: string;
    } = {}
  ) => {
    try {
      resetResult({ preserveVideo: options.preserveVideo });
      const streamModel = options.modelOverride ?? model;

      if (typeof WebSocket === "undefined" || typeof AudioContext === "undefined") {
        throw new Error("Live streaming is not supported.");
      }

      const stream =
        mode === "system"
          ? await getSystemAudioStream()
          : await navigator.mediaDevices.getUserMedia({ audio: true });
      const token = await getAssemblyAIToken();
      const endpoint = new URL("wss://streaming.assemblyai.com/v3/ws");
      endpoint.searchParams.set("token", token);
      endpoint.searchParams.set("sample_rate", String(ASSEMBLYAI_SAMPLE_RATE));
      endpoint.searchParams.set("encoding", "pcm_s16le");
      endpoint.searchParams.set("speech_model", streamModel);
      endpoint.searchParams.set("speaker_labels", "true");
      endpoint.searchParams.set("max_speakers", "2");

      const socket = new WebSocket(endpoint);
      socket.binaryType = "arraybuffer";
      assemblyWebSocketRef.current = socket;
      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => stopLiveCapture();
      });

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("AssemblyAI connection failed"));
      });

      socket.onmessage = (event) =>
        handleAssemblyAIMessage(
          event,
          options.source ?? (mode === "system" ? "system live" : "mic live"),
          streamModel
        );
      socket.onerror = () => {
        setError("AssemblyAI streaming failed");
        stopLiveCapture();
      };
      socket.onclose = () => {
        closeAssemblyAIConnection();
        stopStream();
        setCaptureMode("idle");
      };

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        const input = event.inputBuffer.getChannelData(0);
        const audio = downsampleToPCM16(
          input,
          audioContext.sampleRate,
          ASSEMBLYAI_SAMPLE_RATE
        );

        if (audio.byteLength > 0) {
          socket.send(audio);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      audioContextRef.current = audioContext;
      audioSourceRef.current = source;
      audioProcessorRef.current = processor;
      setCaptureMode(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AssemblyAI unavailable.");
      setCaptureMode("idle");
      closeAssemblyAIConnection();
      stopStream();
    }
  };

  const startYouTubeLiveCapture = async (url: string) => {
    const embedUrl = getYouTubeEmbedUrl(url);

    if (!embedUrl) {
      setError("Enter a valid YouTube video link.");
      return;
    }

    const assemblyModel = getProviderConfig("assemblyai").models[0].value;
    setProvider("assemblyai");
    setModel(assemblyModel);
    setEmbeddedVideo({ sourceUrl: url, embedUrl });
    await startAssemblyAIStreaming("system", {
      modelOverride: assemblyModel,
      preserveVideo: true,
      source: url,
    });
  };

  const submitAudio = async (
    blob: Blob,
    source: string,
    mode: "replace" | "append"
  ) => {
    if (provider === "assemblyai") {
      throw new Error("Use live capture with AssemblyAI.");
    }

    if (Math.ceil(blob.size / 3) * 4 > MAX_AUDIO_CONTENT_LENGTH) {
      throw new Error(AUDIO_SIZE_ERROR);
    }

    setProcessingCount((count) => count + 1);

    try {
      const base64Audio = await blobToBase64(blob);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioContent: base64Audio,
          provider,
          model,
          languageCode: "en-US",
          speakerCount: 2,
        }),
      });
      const data = (await response.json()) as TranscriptionResponse;

      if (!response.ok) {
        throw new Error(data.error || "Transcription failed");
      }

      const words = data.transcriptionData ?? [];
      setTranscription((current) =>
        mode === "append" ? [...current, ...words] : words
      );
      setResultMeta({
        provider: data.provider ?? provider,
        model: data.model ?? model,
        source,
      });
    } finally {
      setProcessingCount((count) => Math.max(0, count - 1));
    }
  };

  const enqueueLiveChunk = (blob: Blob, source: string) => {
    if (blob.size === 0) {
      return;
    }

    const chunkNumber = ++chunkIndexRef.current;

    submitQueueRef.current = submitQueueRef.current
      .catch(() => undefined)
      .then(() => submitAudio(blob, `${source} ${chunkNumber}`, "append"))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Live transcription failed");
      });
  };

  const getSystemAudioStream = async (): Promise<MediaStream> => {
    if (!navigator.mediaDevices.getDisplayMedia) {
      throw new Error("System audio capture is not supported.");
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });
    const audioTracks = displayStream.getAudioTracks();

    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach((track) => track.stop());
      throw new Error("Share a tab or screen with audio enabled.");
    }

    displayStream.getVideoTracks().forEach((track) => track.stop());
    return new MediaStream(audioTracks);
  };

  const startLiveCapture = async (mode: Exclude<CaptureMode, "idle">) => {
    if (provider === "assemblyai") {
      await startAssemblyAIStreaming(mode);
      return;
    }

    try {
      resetResult();

      if (typeof MediaRecorder === "undefined") {
        throw new Error("Recording is not supported.");
      }

      const stream =
        mode === "system"
          ? await getSystemAudioStream()
          : await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => stopLiveCapture();
      });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm; codecs=opus")
        ? "audio/webm; codecs=opus"
        : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        enqueueLiveChunk(new Blob([event.data], { type: mimeType }), mode);
      };
      mediaRecorder.onerror = () => {
        setError("Capture failed.");
        stopLiveCapture();
      };
      mediaRecorder.onstop = () => {
        stopStream();
        setCaptureMode("idle");
      };

      mediaRecorder.start(LIVE_CHUNK_MS);
      setCaptureMode(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture unavailable.");
      setCaptureMode("idle");
      stopStream();
    }
  };

  const stopLiveCapture = () => {
    if (assemblyWebSocketRef.current || audioContextRef.current) {
      closeAssemblyAIConnection();
      stopStream();
      setCaptureMode("idle");
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      stopStream();
      setCaptureMode("idle");
    }

    mediaRecorderRef.current = null;
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      resetResult();

      if (file.size === 0) {
        throw new Error("File is empty.");
      }

      if (!isSupportedUpload(file)) {
        throw new Error(AUDIO_FORMAT_ERROR);
      }

      await submitAudio(file, file.name, "replace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleLinkSubmit = () => {
    void submitMediaUrl();
  };

  const statusLabel = live
    ? captureMode === "system"
      ? "System live"
      : "Mic live"
    : linkStatus
      ? linkStatus
      : processing
      ? "Processing"
      : "Ready";

  return (
    <main className="min-h-screen px-5 py-5 text-[var(--app-text)] sm:px-8 sm:py-8">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="border border-[var(--app-border)] bg-black">
          <div className="border-b border-[var(--app-border)] px-5 py-6 sm:px-6">
            <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.34em] text-[var(--app-faint)]">
              Diarization Demo
            </p>
            <h1 className="mt-4 text-4xl font-medium leading-none text-white sm:text-5xl">
              Live diarization
            </h1>
            <ol className="mt-5 grid gap-2 text-sm leading-6 text-[var(--app-muted)]">
              <li>1. Paste an interview link.</li>
              <li>2. Or use System/Mic audio.</li>
              <li>3. Watch speaker turns appear.</li>
            </ol>
          </div>

          <div className="grid gap-4 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between border-b border-[var(--app-border)] pb-4">
              <span className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.24em] text-[var(--app-muted)]">
                {statusLabel}
              </span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  live ? "animate-pulse bg-white" : "bg-[var(--app-faint)]"
                }`}
              />
            </div>

            <label className="grid gap-2">
              <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                Backend
              </span>
              <select
                value={provider}
                onChange={(event) => selectProvider(event.target.value)}
                disabled={live || processing}
                className="border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3 text-sm text-white outline-none transition focus:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:text-[var(--app-faint)]"
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.status !== "available"}
                  >
                    {option.label}
                    {option.status === "coming-soon" ? " (soon)" : ""}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--app-muted)]">
                {selectedProvider.summary}
              </span>
            </label>

            <label className="grid gap-2">
              <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                Model
              </span>
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={live || processing}
                className="border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3 text-sm text-white outline-none transition focus:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:text-[var(--app-faint)]"
              >
                {selectedProvider.models.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <button
                onClick={() =>
                  live ? stopLiveCapture() : startLiveCapture("system")
                }
                disabled={!live && processing}
                className="border border-[var(--app-border-strong)] bg-white px-4 py-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.2em] text-black transition hover:bg-[#d8d8d8] disabled:cursor-not-allowed disabled:border-[var(--app-border)] disabled:bg-[var(--app-panel-strong)] disabled:text-[var(--app-faint)]"
              >
                {live ? "Stop" : "System"}
              </button>

              <button
                onClick={() => startLiveCapture("mic")}
                disabled={live || processing}
                className="border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.2em] text-white transition hover:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:text-[var(--app-faint)]"
              >
                Mic
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={live || processing || provider === "assemblyai"}
                className="border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.2em] text-white transition hover:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:text-[var(--app-faint)]"
              >
                Upload
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/webm,.webm"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                aria-label="Media URL"
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                disabled={live || processing}
                placeholder="YouTube or media URL"
                className="min-w-0 border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3 text-sm text-white outline-none transition placeholder:text-[var(--app-faint)] focus:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:text-[var(--app-faint)]"
              />
              <button
                onClick={handleLinkSubmit}
                disabled={live || processing || !mediaUrl.trim()}
                className="border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.2em] text-white transition hover:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:text-[var(--app-faint)]"
              >
                Link
              </button>
            </div>

            {embeddedVideo && (
              <div className="overflow-hidden border border-[var(--app-border)] bg-black">
                <iframe
                  title="YouTube video player"
                  src={embeddedVideo.embedUrl}
                  className="aspect-video w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            )}

            {error && (
              <div className="border border-[var(--app-border-strong)] bg-[var(--app-panel)] px-4 py-4 text-sm text-white">
                {error}
              </div>
            )}
          </div>
        </section>

        <section className="border border-[var(--app-border)] bg-black">
          <div className="flex flex-col gap-3 border-b border-[var(--app-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <h2 className="text-2xl font-medium text-white">Transcript</h2>

            <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--app-muted)]">
              {(activeSpeakerIds.length > 0 ? activeSpeakerIds : [1, 2]).map(
                (speaker) => (
                  <span key={speaker} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: speakerTone(speaker) }}
                    />
                    {getSpeakerLabel(speaker, speakerNames)}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="min-h-[28rem] bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] px-5 py-6 sm:px-6">
            {displayedTranscription.length > 0 ? (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-[var(--app-muted)]">
                  <span>{resultMeta?.provider ?? provider}</span>
                  <span>{resultMeta?.model ?? model}</span>
                  <span>{resultMeta?.source}</span>
                  <span>{displayedTranscription.length} words</span>
                </div>

                <div className="grid gap-3 border border-[var(--app-border)] bg-black/30 p-3 sm:grid-cols-2">
                  {activeSpeakerIds.map((speaker) => (
                    <label key={speaker} className="grid gap-2">
                      <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.24em] text-[var(--app-faint)]">
                        {defaultSpeakerLabel(speaker)}
                      </span>
                      <input
                        aria-label={`Name for ${defaultSpeakerLabel(speaker)}`}
                        value={speakerNames[speaker] ?? ""}
                        onChange={(event) =>
                          updateSpeakerName(speaker, event.target.value)
                        }
                        placeholder="Name"
                        className="min-w-0 border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm text-white outline-none transition placeholder:text-[var(--app-faint)] focus:border-[var(--app-border-strong)]"
                      />
                    </label>
                  ))}
                </div>

                <div className="grid gap-4">
                  {speakerTurns.map((turn, turnIndex) => (
                    <div
                      key={`${turn.speaker}-${turnIndex}`}
                      className="grid gap-2 border-l px-3"
                      style={{ borderColor: speakerTone(turn.speaker) }}
                    >
                      <div
                        className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.24em]"
                        style={{ color: speakerTone(turn.speaker) }}
                      >
                        {getSpeakerLabel(turn.speaker, speakerNames)}
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-2 font-[family-name:var(--font-geist-mono)] text-sm leading-8 sm:text-[15px]">
                        {turn.words.map((item, wordIndex) => (
                          <span
                            key={`${turnIndex}-${wordIndex}`}
                            style={{ color: speakerTone(item.speaker) }}
                          >
                            {item.word}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[23rem] items-center justify-center border border-dashed border-[var(--app-border)] bg-[var(--app-panel)] px-5 text-sm text-[var(--app-muted)]">
                {live ? "Listening..." : "No transcript"}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function isSupportedUpload(file: File): boolean {
  return file.type === "audio/webm" || file.name.toLowerCase().endsWith(".webm");
}

function downsampleToPCM16(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): ArrayBuffer {
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(input.length / sampleRateRatio);
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sample = input[Math.floor(i * sampleRateRatio)] ?? 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  return output.buffer;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
