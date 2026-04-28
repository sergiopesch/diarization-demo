import { NextRequest, NextResponse } from "next/server";

import { isYouTubeUrl } from "@/lib/media-url";
import { type TranscriptWord } from "@/lib/transcription";

export const runtime = "nodejs";

const TRANSCRIPT_URL = "https://api.assemblyai.com/v2/transcript";
const MAX_MEDIA_URL_LENGTH = 2048;

type SubmitTranscriptRequest = {
  audioUrl?: unknown;
  model?: unknown;
};

type AssemblyAITranscriptResponse = {
  id?: string;
  status?: string;
  error?: string;
  utterances?: AssemblyAIUtterance[];
};

type AssemblyAIUtterance = {
  speaker?: string;
  text?: string;
  words?: Array<{
    text?: string;
    word?: string;
    speaker?: string;
    start?: number;
    end?: number;
  }>;
};

export type AssemblyAITranscriptPayload = {
  id: string;
  status: string;
  provider: "assemblyai";
  model: string;
  transcriptionData: TranscriptWord[];
  error?: string;
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as
    | SubmitTranscriptRequest
    | null;
  const audioUrl = typeof body?.audioUrl === "string" ? body.audioUrl.trim() : "";
  const urlError = validateMediaUrl(audioUrl);

  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 400 });
  }

  const model = getAsyncModel(body?.model);

  if (isYouTubeUrl(audioUrl)) {
    return NextResponse.json(
      {
        error:
          "YouTube links use live System audio. Play the clip, share tab audio, and watch diarization appear live.",
      },
      { status: 422 }
    );
  }

  const response = await fetch(TRANSCRIPT_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speaker_labels: true,
      language_detection: true,
      speech_models: [model, "universal-2"],
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as
    | AssemblyAITranscriptResponse
    | Record<string, unknown>;

  if (!response.ok || typeof payload.id !== "string") {
    return NextResponse.json(
      {
        error:
          typeof payload.error === "string"
            ? formatAssemblyAIError(payload.error)
            : "AssemblyAI transcript request failed",
      },
      { status: response.status || 502 }
    );
  }

  return NextResponse.json({
    id: payload.id,
    status: typeof payload.status === "string" ? payload.status : "queued",
    provider: "assemblyai",
    model,
    transcriptionData: [],
  } satisfies AssemblyAITranscriptPayload);
}

export function validateMediaUrl(value: string): string | null {
  if (!value) {
    return "Enter a public audio or video URL";
  }

  if (value.length > MAX_MEDIA_URL_LENGTH) {
    return "Media URL is too long";
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "Media URL must start with http:// or https://";
    }
  } catch {
    return "Enter a valid media URL";
  }

  return null;
}

export function getAsyncModel(value: unknown): string {
  return value === "universal-2" ? "universal-2" : "universal-3-pro";
}

export function formatAssemblyAIError(error: string): string {
  if (
    /text\/html/i.test(error) ||
    /does not appear to contain audio/i.test(error)
  ) {
    return "This link points to a web page, not readable audio. Use System audio while it plays, or paste a direct media file URL.";
  }

  return error;
}

export function mapAssemblyAIUtterances(
  utterances: AssemblyAIUtterance[] | undefined
): TranscriptWord[] {
  return (utterances ?? []).flatMap((utterance) => {
    if (utterance.words?.length) {
      return utterance.words
        .map((word) => ({
          word: word.text ?? word.word ?? "",
          speaker: speakerNumber(word.speaker ?? utterance.speaker),
          startSeconds:
            typeof word.start === "number" ? word.start / 1000 : null,
          endSeconds: typeof word.end === "number" ? word.end / 1000 : null,
        }))
        .filter((word) => word.word.trim());
    }

    return (utterance.text ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => ({
        word,
        speaker: speakerNumber(utterance.speaker),
      }));
  });
}

function speakerNumber(label: string | undefined): number {
  if (!label) {
    return 0;
  }

  const firstLetter = label.trim().toUpperCase().charCodeAt(0);
  return firstLetter >= 65 && firstLetter <= 90 ? firstLetter - 64 : 0;
}
