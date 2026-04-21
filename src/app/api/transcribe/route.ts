import { NextRequest, NextResponse } from "next/server";

import { transcribeWithGoogle } from "@/lib/google-transcription";
import { transcribeWithLocalService } from "@/lib/local-transcription";
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
    const payload = await req.json();
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function transcribe(request: NormalizedTranscriptionRequest) {
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
    configuredProvider === "google"
    ? configuredProvider
    : DEFAULT_TRANSCRIPTION_PROVIDER;
}
