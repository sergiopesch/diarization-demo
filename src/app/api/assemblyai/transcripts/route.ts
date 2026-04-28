import { NextRequest, NextResponse } from "next/server";

import { isYouTubeUrl } from "@/lib/media-url";
import {
  type AssemblyAITranscriptPayload,
  type AssemblyAITranscriptResponse,
  formatAssemblyAIError,
  getAsyncModel,
  validateMediaUrl,
} from "@/lib/assemblyai-transcription";

export const runtime = "nodejs";

const TRANSCRIPT_URL = "https://api.assemblyai.com/v2/transcript";
const REQUEST_TIMEOUT_MS = 15_000;

type SubmitTranscriptRequest = {
  audioUrl?: unknown;
  model?: unknown;
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

  const { response, payload, error } = await submitAssemblyAITranscript(
    apiKey,
    audioUrl,
    model
  );

  if (error) {
    return NextResponse.json({ error }, { status: 502 });
  }

  if (!response?.ok || typeof payload?.id !== "string") {
    return NextResponse.json(
      {
        error:
          typeof payload?.error === "string"
            ? formatAssemblyAIError(payload.error)
            : "AssemblyAI transcript request failed",
      },
      { status: response?.status || 502 }
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

async function submitAssemblyAITranscript(
  apiKey: string,
  audioUrl: string,
  model: string
): Promise<{
  response: Response | null;
  payload: AssemblyAITranscriptResponse | null;
  error: string | null;
}> {
  try {
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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => ({}))) as
      | AssemblyAITranscriptResponse
      | Record<string, unknown>;

    return {
      response,
      payload,
      error: null,
    };
  } catch (error) {
    return {
      response: null,
      payload: null,
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? "AssemblyAI transcript request timed out"
          : "AssemblyAI transcript service is unavailable",
    };
  }
}
