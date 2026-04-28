import { NextRequest, NextResponse } from "next/server";

import { transcribeWithGoogle } from "@/lib/google-transcription";
import {
  LocalTranscriptionServiceError,
  transcribeWithLocalService,
} from "@/lib/local-transcription";
import {
  DEFAULT_TRANSCRIPTION_PROVIDER,
  type NormalizedTranscriptionRequest,
  type TranscriptionProvider,
  normalizeTranscriptionRequest,
} from "@/lib/transcription";

export const runtime = "nodejs";

const LOCAL_PROVIDERS = new Set<TranscriptionProvider>([
  "whisperx",
  "parakeet-pyannote",
  "nemo",
]);

export async function POST(req: NextRequest) {
  try {
    const payload = await readJsonBody(req);
    const fallbackProvider = getDefaultProvider();
    const { value, error } = normalizeTranscriptionRequest(
      payload,
      fallbackProvider
    );

    if (error || !value) {
      const status = error?.includes("too large") ? 413 : 400;
      return NextResponse.json({ error }, { status });
    }

    const result = await transcribe(value);

    return NextResponse.json({
      transcriptionData: result.transcriptionData,
      provider: value.provider,
      model: result.model,
    });
  } catch (error: unknown) {
    console.error("Transcription error:", error);
    const message = error instanceof Error ? error.message : "Unknown transcription error";
    const status =
      error instanceof LocalTranscriptionServiceError
        ? error.statusCode
        : error instanceof RequestBodyError
          ? error.statusCode
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

async function readJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new RequestBodyError("Request body must be valid JSON");
  }
}

class RequestBodyError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "RequestBodyError";
  }
}

async function transcribe(request: NormalizedTranscriptionRequest) {
  if (request.provider === "assemblyai") {
    throw new RequestBodyError(
      "AssemblyAI uses the live streaming route; use System or Mic capture."
    );
  }

  if (request.provider === "google") {
    return transcribeWithGoogle(request);
  }

  if (LOCAL_PROVIDERS.has(request.provider)) {
    return transcribeWithLocalService(request);
  }

  throw new Error(`Unsupported transcription provider: ${request.provider}`);
}

function getDefaultProvider(): TranscriptionProvider {
  const configuredProvider = process.env.TRANSCRIPTION_PROVIDER;

  return configuredProvider === "whisperx" ||
    configuredProvider === "parakeet-pyannote" ||
    configuredProvider === "nemo" ||
    configuredProvider === "assemblyai" ||
    configuredProvider === "google"
    ? configuredProvider
    : DEFAULT_TRANSCRIPTION_PROVIDER;
}
