"use client";

import { useEffect, useRef, useState } from "react";

type TranscriptWord = {
  word: string;
  speaker: number;
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
    setRecording(false);
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  const colorForSpeaker = (speaker: number): string => {
    switch (speaker) {
      case 1:
        return "#1F75FE";
      case 2:
        return "#FF5349";
      case 3:
        return "#FFA500";
      default:
        return "#2E8B57";
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10 text-gray-900 sm:px-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <section className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
                Browser Audio Demo
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Google Speech Diarization
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                Record a short conversation, send it to Google Cloud
                Speech-to-Text, and inspect the returned transcript segmented by
                detected speaker.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-gray-600">
              <span className="rounded-full bg-gray-100 px-3 py-1">
                WebM / Opus upload
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1">
                Two-speaker diarization
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1">
                Google Cloud Speech API
              </span>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {!recording ? (
                <button
                  onClick={startRecording}
                  disabled={submitting}
                  className="rounded-full bg-green-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  Start Recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="rounded-full bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  Stop Recording
                </button>
              )}

              <p className="text-sm text-gray-500">
                {recording
                  ? "Recording in progress."
                  : submitting
                    ? "Uploading and transcribing."
                    : "Ready to capture microphone input."}
              </p>
            </div>

            {error && (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">How To Use It</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
              <li>1. Allow microphone access when the browser prompts you.</li>
              <li>2. Record a short conversation with two speakers.</li>
              <li>3. Stop recording and wait for the transcript to return.</li>
              <li>4. Review the output colors to compare speaker assignments.</li>
            </ol>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Diarized Transcript</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Each word is colored by the speaker tag returned from the API.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#1F75FE]" />
                  Speaker 1
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#FF5349]" />
                  Speaker 2
                </span>
              </div>
            </div>

            <div className="mt-5 min-h-40 rounded-2xl bg-gray-50 p-4">
              {transcription.length > 0 ? (
                <div className="flex flex-wrap gap-1 text-sm leading-7">
                  {transcription.map((item, index) => (
                    <span
                      key={index}
                      style={{ color: colorForSpeaker(item.speaker) }}
                    >
                      {item.word}{" "}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No transcript yet. Record audio to generate speaker-labeled
                  output.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
