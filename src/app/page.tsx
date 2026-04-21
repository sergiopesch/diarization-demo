"use client";

import { useEffect, useRef, useState } from "react";

type TranscriptWord = {
  word: string;
  speaker: number;
};

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

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptWord[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
          const resp = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioContent: base64Audio }),
          });
          const data = await resp.json();

          if (!resp.ok) {
            throw new Error(data.error || "Transcription failed");
          }

          setTranscription(data.transcriptionData ?? []);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Transcription failed"
          );
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
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  return (
    <main className="min-h-screen px-5 py-6 text-[var(--app-text)] sm:px-8 sm:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="grid gap-4 border border-[var(--app-border)] bg-[var(--app-panel)] p-4 backdrop-blur md:grid-cols-[1.45fr_0.85fr] md:p-6">
          <div className="flex flex-col gap-6">
            <div>
              <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.45em] text-[var(--app-faint)]">
                Codex Inspired Interface / Voice Diarization
              </p>
              <h1 className="mt-5 max-w-4xl text-4xl font-medium tracking-[-0.06em] text-white sm:text-6xl">
                Minimal voice analysis in a black-and-white operator shell.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--app-muted)] sm:text-base">
                Capture a short exchange, send it through Google Cloud Speech,
                then inspect the diarized transcript in a stripped-down
                monochrome surface built to feel closer to a terminal than a
                marketing page.
              </p>
            </div>

            <div className="grid gap-px border border-[var(--app-border)] bg-[var(--app-border)] sm:grid-cols-3">
              <div className="bg-black px-4 py-4">
                <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                  Input
                </p>
                <p className="mt-2 text-sm text-[var(--app-text)]">
                  Browser microphone / WebM Opus
                </p>
              </div>
              <div className="bg-black px-4 py-4">
                <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                  Mode
                </p>
                <p className="mt-2 text-sm text-[var(--app-text)]">
                  Two-speaker diarization / sync path
                </p>
              </div>
              <div className="bg-black px-4 py-4">
                <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                  Engine
                </p>
                <p className="mt-2 text-sm text-[var(--app-text)]">
                  Google Cloud Speech-to-Text
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-px border border-[var(--app-border)] bg-[var(--app-border)]">
            <div className="bg-black p-4">
              <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                Session Control
              </p>

              <div className="mt-5 flex flex-col gap-4">
                {!recording ? (
                  <button
                    onClick={startRecording}
                    disabled={submitting}
                    className="min-w-44 border border-[var(--app-border-strong)] bg-white px-4 py-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.28em] text-black transition hover:bg-[#d9d9d9] disabled:cursor-not-allowed disabled:border-[var(--app-border)] disabled:bg-[var(--app-panel-strong)] disabled:text-[var(--app-faint)]"
                  >
                    Start Recording
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="min-w-44 border border-white bg-black px-4 py-3 font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-[0.28em] text-white transition hover:bg-[var(--app-panel-strong)]"
                  >
                    Stop Recording
                  </button>
                )}

                <div className="grid gap-px border border-[var(--app-border)] bg-[var(--app-border)]">
                  <div className="bg-black px-4 py-3">
                    <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                      Status
                    </p>
                    <p className="mt-2 text-sm text-[var(--app-text)]">
                      {recording
                        ? "Listening live."
                        : submitting
                          ? "Uploading and transcribing."
                          : "Idle and ready."}
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="border border-[var(--app-border-strong)] bg-[var(--app-panel)] px-4 py-3">
                    <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.3em] text-[var(--app-faint)]">
                      Error
                    </p>
                    <p className="mt-2 text-sm text-white">{error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <aside className="grid gap-px border border-[var(--app-border)] bg-[var(--app-border)] self-start">
            <div className="bg-[var(--app-panel)] p-5">
              <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--app-faint)]">
                Sequence
              </p>
              <ol className="mt-5 space-y-4 text-sm leading-6 text-[var(--app-muted)]">
                <li>
                  <span className="mr-3 font-[family-name:var(--font-geist-mono)] text-[var(--app-faint)]">
                    01
                  </span>
                  Grant microphone access.
                </li>
                <li>
                  <span className="mr-3 font-[family-name:var(--font-geist-mono)] text-[var(--app-faint)]">
                    02
                  </span>
                  Capture a short exchange between two voices.
                </li>
                <li>
                  <span className="mr-3 font-[family-name:var(--font-geist-mono)] text-[var(--app-faint)]">
                    03
                  </span>
                  Stop recording and wait for speaker assignment.
                </li>
                <li>
                  <span className="mr-3 font-[family-name:var(--font-geist-mono)] text-[var(--app-faint)]">
                    04
                  </span>
                  Inspect word-level speaker separation in the console pane.
                </li>
              </ol>
            </div>

            <div className="bg-black p-5">
              <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--app-faint)]">
                Legend
              </p>
              <div className="mt-5 grid gap-3 text-sm">
                <div className="flex items-center justify-between border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3">
                  <span className="text-[var(--app-muted)]">Speaker 1</span>
                  <span className="font-[family-name:var(--font-geist-mono)] text-white">
                    #FFFFFF
                  </span>
                </div>
                <div className="flex items-center justify-between border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3">
                  <span className="text-[var(--app-muted)]">Speaker 2</span>
                  <span className="font-[family-name:var(--font-geist-mono)] text-[var(--speaker-two)]">
                    #FFFFFF94
                  </span>
                </div>
              </div>
            </div>
          </aside>

          <div className="border border-[var(--app-border)] bg-black">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4">
              <div>
                <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--app-faint)]">
                  Transcript Surface
                </p>
                <h2 className="mt-2 text-lg font-medium text-white">
                  Speaker-separated output
                </h2>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="h-2.5 w-2.5 rounded-full bg-white" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--speaker-two)]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--app-faint)]" />
              </div>
            </div>

            <div className="min-h-[30rem] bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] p-5 sm:p-6">
              {!recording ? (
                transcription.length > 0 ? (
                  <div className="flex flex-wrap gap-x-2 gap-y-3 font-[family-name:var(--font-geist-mono)] text-sm leading-8 sm:text-[15px]">
                    {transcription.map((item, index) => (
                      <span key={index} style={{ color: speakerTone(item.speaker) }}>
                        {item.word}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[26rem] flex-col justify-between border border-dashed border-[var(--app-border)] bg-[var(--app-panel)] p-5">
                    <div>
                      <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--app-faint)]">
                        Awaiting Input
                      </p>
                      <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--app-muted)]">
                        The transcript pane stays empty until a recording is
                        captured and processed. Once diarization completes, each
                        word is rendered here with a monochrome speaker tone.
                      </p>
                    </div>

                    <div className="grid gap-px border border-[var(--app-border)] bg-[var(--app-border)] sm:grid-cols-3">
                      <div className="bg-black px-4 py-4">
                        <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.28em] text-[var(--app-faint)]">
                          Runtime
                        </p>
                        <p className="mt-2 text-sm text-[var(--app-text)]">
                          Node.js route
                        </p>
                      </div>
                      <div className="bg-black px-4 py-4">
                        <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.28em] text-[var(--app-faint)]">
                          Limit
                        </p>
                        <p className="mt-2 text-sm text-[var(--app-text)]">
                          Short synchronous clips
                        </p>
                      </div>
                      <div className="bg-black px-4 py-4">
                        <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.28em] text-[var(--app-faint)]">
                          Output
                        </p>
                        <p className="mt-2 text-sm text-[var(--app-text)]">
                          Word-level speaker tags
                        </p>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex min-h-[26rem] flex-col justify-between border border-[var(--app-border)] bg-[var(--app-panel)] p-5">
                  <div>
                    <p className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--app-faint)]">
                      Capture Active
                    </p>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--app-muted)]">
                      Input is being buffered from the microphone. Stop the
                      session to hand off the audio for transcription.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 font-[family-name:var(--font-geist-mono)] text-sm uppercase tracking-[0.24em] text-white">
                    <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
                    Recording
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
