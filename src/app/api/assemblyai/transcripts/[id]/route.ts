import { NextRequest, NextResponse } from "next/server";

import {
  type AssemblyAITranscriptPayload,
  formatAssemblyAIError,
  getAsyncModel,
  mapAssemblyAIUtterances,
} from "@/app/api/assemblyai/transcripts/route";

export const runtime = "nodejs";

const TRANSCRIPT_URL = "https://api.assemblyai.com/v2/transcript";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AssemblyAITranscriptResponse = {
  id?: string;
  status?: string;
  error?: string;
  utterances?: Parameters<typeof mapAssemblyAIUtterances>[0];
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

  const response = await fetch(`${TRANSCRIPT_URL}/${id}`, {
    headers: {
      Authorization: apiKey,
    },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as
    | AssemblyAITranscriptResponse
    | Record<string, unknown>;

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          typeof payload.error === "string"
            ? formatAssemblyAIError(payload.error)
            : "AssemblyAI transcript status request failed",
      },
      { status: response.status || 502 }
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
