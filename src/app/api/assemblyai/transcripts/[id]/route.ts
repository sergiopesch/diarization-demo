import { NextRequest, NextResponse } from "next/server";

import {
  type AssemblyAITranscriptPayload,
  type AssemblyAITranscriptResponse,
  formatAssemblyAIError,
  getAsyncModel,
  mapAssemblyAIUtterances,
} from "@/lib/assemblyai-transcription";

export const runtime = "nodejs";

const TRANSCRIPT_URL = "https://api.assemblyai.com/v2/transcript";
const REQUEST_TIMEOUT_MS = 15_000;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const { id } = await context.params;

  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid transcript id" }, { status: 400 });
  }

  const { response, payload, error } = await fetchTranscriptStatus(apiKey, id);

  if (error) {
    return NextResponse.json({ error }, { status: 502 });
  }

  if (!response?.ok) {
    return NextResponse.json(
      {
        error:
          typeof payload?.error === "string"
            ? formatAssemblyAIError(payload.error)
            : "AssemblyAI transcript status request failed",
      },
      { status: response?.status || 502 }
    );
  }

  if (!payload) {
    return NextResponse.json(
      { error: "AssemblyAI transcript status request failed" },
      { status: 502 }
    );
  }

  const status = typeof payload.status === "string" ? payload.status : "queued";

  return NextResponse.json({
    id,
    status,
    provider: "assemblyai",
    model: getAsyncModel(req.nextUrl.searchParams.get("model")),
    transcriptionData:
      status === "completed" && Array.isArray(payload.utterances)
        ? mapAssemblyAIUtterances(payload.utterances)
        : [],
    error:
      typeof payload.error === "string"
        ? formatAssemblyAIError(payload.error)
        : undefined,
  } satisfies AssemblyAITranscriptPayload);
}

async function fetchTranscriptStatus(
  apiKey: string,
  id: string
): Promise<{
  response: Response | null;
  payload: AssemblyAITranscriptResponse | null;
  error: string | null;
}> {
  try {
    const response = await fetch(`${TRANSCRIPT_URL}/${id}`, {
      headers: {
        Authorization: apiKey,
      },
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
          ? "AssemblyAI transcript status request timed out"
          : "AssemblyAI transcript service is unavailable",
    };
  }
}
