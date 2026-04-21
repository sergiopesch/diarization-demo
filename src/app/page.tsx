"use client";

import { useEffect, useRef, useState } from "react";

import type {
  TranscriptWord,
  TranscriptionProvider,
} from "@/lib/transcription";

type ProviderOption = {
  value: TranscriptionProvider;
  label: string;
  summary: string;
  models: Array<{ value: string; label: string }>;
};

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: "google",
    label: "Google Speech",
    summary: "Cloud baseline with fixed two-speaker diarization.",
    models: [{ value: "google-speech-default", label: "Speech default" }],
  },
  {
    value: "whisperx",
    label: "WhisperX + pyannote",
    summary: "Best local baseline for word timestamps plus diarization.",
    models: [
      { value: "large-v3-turbo", label: "Whisper large-v3-turbo" },
      { value: "large-v3", label: "Whisper large-v3" },
      { value: "distil-large-v3", label: "distil-large-v3" },
    ],
  },
  {
    value: "parakeet-pyannote",
    label: "Parakeet + pyannote",
    summary: "Fast ASR path with external diarization worker.",
    models: [
      {
        value: "nvidia/parakeet-unified-en-0.6b",
        label: "Parakeet unified 0.6B",
      },
      {
        value: "nvidia/parakeet-tdt-0.6b-v2",
        label: "Parakeet TDT 0.6B v2",
      },
    ],
  },
  {
    value: "nemo",
    label: "NeMo diarization",
    summary: "Research-grade diarization experiments via local worker.",
    models: [
      { value: "sortformer", label: "Sortformer diarizer" },
      { value: "msdd+titanet", label: "MSDD + TitaNet" },
    ],
  },
];

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

const getProviderConfig = (provider: TranscriptionProvider): ProviderOption =>
  PROVIDER_OPTIONS.find((option) => option.value === provider) ?? PROVIDER_OPTIONS[0];

export default function Home() {
  const [provider, setProvider] = useState<TranscriptionProvider>("whisperx");
  const [model, setModel] = useState(getProviderConfig("whisperx").models[0].value);
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptWord[]>([]);
  const [resultProvider, setResultProvider] = useState<string | null>(null);
  const [resultModel, setResultModel] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
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

  const startRecording = async () => {
    try {
      setError(null);
      setTranscription([]);
      setResultProvider(null);
      setResultModel(null);
      chunksRef.current = [];

      if (typeof MediaRecorder === "undefined") {
        throw new Error("This browser does not support audio recording.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm; codecs=opus")
        ? "audio/webm; codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = () => {
        setError("Recording failed. Please try again.");
        setRecording(false);
        setSubmitting(false);
        stopStream();
      };

      mediaRecorder.onstop = async () => {
        try {
          stopStream();

          if (chunksRef.current.length === 0) {
            throw new Error("No audio was captured. Please try again.");
          }

          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          setSubmitting(true);

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
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Transcription failed");
          }

          setTranscription(data.transcriptionData ?? []);
          setResultProvider(data.provider ?? provider);
          setResultModel(data.model ?? model);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setSubmitting(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access failed");
      setRecording(false);
      stopStream();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== "recording") {
      return;
    }

    setRecording(false);
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
  };

  const selectedProvider = getProviderConfig(provider);
  const statusLabel = recording
    ? "Recording live"
    : submitting
      ? "Uploading and transcribing"
      : "Idle and ready";

  return (
    <main className="min-h-screen px-5 py-5 text-[var(--app-text)] sm:px-8 sm:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="grid gap-px border border-[var(--app-border)] bg-[var(--app-border)] lg:grid-cols-[1.35fr_0.9fr]">
          <div className="bg-[var(--app-panel)] px-5 py-8 sm:px-8 sm:py-10">
            <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.42em] text-[var(--app-faint)]">
              Diarization Demo
            </p>
            <h1 className="mt-6 max-w-4xl text-4xl font-medium leading-none tracking-[-0.06em] text-white sm:text-6xl">
              Compare diarization backends from the same recording surface.
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-[var(--app-muted)] sm:text-base">
              Use Google as a cloud baseline or route audio into a local worker
              for WhisperX, pyannote, Parakeet, and NeMo experiments without
              changing the frontend flow.
            </p>

            <div className="mt-8 grid gap-px border border-[var(--app-border)] bg-[var(--app-border)] sm:grid-cols-3">
              <div className="bg-black px-4 py-4">
                <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                  Input
                </p>
                <p className="mt-2 text-sm text-white">Microphone / WebM Opus</p>
              </div>
              <div className="bg-black px-4 py-4">
                <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                  Provider
                </p>
                <p className="mt-2 text-sm text-white">{selectedProvider.label}</p>
              </div>
              <div className="bg-black px-4 py-4">
                <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                  Mode
                </p>
                <p className="mt-2 text-sm text-white">Two-speaker diarization</p>
              </div>
            </div>
          </div>

          <div className="bg-black px-5 py-6 sm:px-6 sm:py-8">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] pb-4">
              <div>
                <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.34em] text-[var(--app-faint)]">
                  Session Control
                </p>
                <p className="mt-2 text-sm text-[var(--app-muted)]">
                  {statusLabel}
                </p>
              </div>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  recording ? "animate-pulse bg-white" : "bg-[var(--app-faint)]"
                }`}
              />
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <label className="grid gap-2">
                <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                  Backend
                </span>
                <select
                  value={provider}
                  onChange={(event) =>
                    setProvider(event.target.value as TranscriptionProvider)
                  }
                  disabled={recording || submitting}
                  className="border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3 text-sm text-white outline-none transition focus:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:text-[var(--app-faint)]"
                >
                  {PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs leading-6 text-[var(--app-muted)]">
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
                  disabled={recording || submitting}
                  className="border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3 text-sm text-white outline-none transition focus:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:text-[var(--app-faint)]"
                >
                  {selectedProvider.models.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {!recording ? (
                <button
                  onClick={startRecording}
                  disabled={submitting}
                  className="border border-[var(--app-border-strong)] bg-white px-4 py-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.28em] text-black transition hover:bg-[#d8d8d8] disabled:cursor-not-allowed disabled:border-[var(--app-border)] disabled:bg-[var(--app-panel-strong)] disabled:text-[var(--app-faint)]"
                >
                  Start Recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="border border-white bg-black px-4 py-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.28em] text-white transition hover:bg-[var(--app-panel-strong)]"
                >
                  Stop Recording
                </button>
              )}

              <div className="grid gap-px border border-[var(--app-border)] bg-[var(--app-border)]">
                <div className="bg-[var(--app-panel)] px-4 py-4">
                  <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                    Output
                  </p>
                  <p className="mt-2 text-sm text-white">
                    Word-level speaker tags with a stable comparison surface.
                  </p>
                </div>
                <div className="bg-[var(--app-panel)] px-4 py-4">
                  <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                    Constraint
                  </p>
                  <p className="mt-2 text-sm text-white">
                    Short clips only. Large uploads are rejected.
                  </p>
                </div>
              </div>

              {error && (
                <div className="border border-[var(--app-border-strong)] bg-[var(--app-panel)] px-4 py-4">
                  <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                    Error
                  </p>
                  <p className="mt-2 text-sm text-white">{error}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="border border-[var(--app-border)] bg-black">
          <div className="flex flex-col gap-4 border-b border-[var(--app-border)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div>
              <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.34em] text-[var(--app-faint)]">
                Transcript Surface
              </p>
              <h2 className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">
                Speaker-separated output
              </h2>
            </div>

            <div className="flex items-center gap-5 text-xs text-[var(--app-muted)]">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-white" />
                Speaker 1
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--speaker-two)]" />
                Speaker 2
              </span>
            </div>
          </div>

          <div className="min-h-[24rem] bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] px-5 py-6 sm:px-6">
            {!recording ? (
              transcription.length > 0 ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.24em] text-[var(--app-muted)]">
                    <span>Provider {resultProvider ?? provider}</span>
                    <span>Model {resultModel ?? model}</span>
                    <span>Words {transcription.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-3 font-[family-name:var(--font-geist-mono)] text-sm leading-8 sm:text-[15px]">
                    {transcription.map((item, index) => (
                      <span key={index} style={{ color: speakerTone(item.speaker) }}>
                        {item.word}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[19rem] flex-col justify-between border border-dashed border-[var(--app-border)] bg-[var(--app-panel)] p-5">
                  <div>
                    <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.34em] text-[var(--app-faint)]">
                      Awaiting Input
                    </p>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--app-muted)]">
                      The transcript pane stays empty until a recording is
                      captured and processed. Use the same clip across providers
                      to compare diarization quality and timing behavior.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="flex min-h-[19rem] flex-col justify-between border border-[var(--app-border)] bg-[var(--app-panel)] p-5">
                <div>
                  <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.34em] text-[var(--app-faint)]">
                    Capture Active
                  </p>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--app-muted)]">
                    Input is being buffered from the microphone. Stop the
                    session to hand off the recording to the selected backend.
                  </p>
                </div>

                <div className="flex items-center gap-3 font-[family-name:var(--font-geist-mono)] text-sm uppercase tracking-[0.24em] text-white">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
                  Recording
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-px border border-[var(--app-border)] bg-[var(--app-border)] sm:grid-cols-3">
          <div className="bg-[var(--app-panel)] px-5 py-5">
            <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.34em] text-[var(--app-faint)]">
              Sequence
            </p>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-[var(--app-muted)]">
              <li>01 / Select a provider and model.</li>
              <li>02 / Grant microphone access.</li>
              <li>03 / Capture a short exchange.</li>
              <li>04 / Compare transcript output.</li>
            </ol>
          </div>

          <div className="bg-[var(--app-panel)] px-5 py-5">
            <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.34em] text-[var(--app-faint)]">
              Evaluation
            </p>
            <p className="mt-4 text-sm leading-7 text-[var(--app-muted)]">
              Keep the recording surface stable and swap only one variable at a
              time: provider, ASR model, or diarization stack.
            </p>
          </div>

          <div className="bg-[var(--app-panel)] px-5 py-5">
            <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.34em] text-[var(--app-faint)]">
              Constraints
            </p>
            <p className="mt-4 text-sm leading-7 text-[var(--app-muted)]">
              The local worker is the right place for heavy Python models. The
              Next route stays thin and synchronous by design.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
