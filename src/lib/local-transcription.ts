import {
  type NormalizedTranscriptionRequest,
  type TranscriptWord,
} from "@/lib/transcription";

type LocalServiceResponse = {
  transcriptionData?: TranscriptWord[];
  model?: string;
  error?: string;
  detail?: string;
};

export async function transcribeWithLocalService(
  request: NormalizedTranscriptionRequest
): Promise<{ transcriptionData: TranscriptWord[]; model: string }> {
  const baseUrl = process.env.LOCAL_TRANSCRIPTION_API_URL;

  if (!baseUrl) {
    throw new Error(
      "LOCAL_TRANSCRIPTION_API_URL is required for local transcription providers"
    );
  }

  const endpoint = new URL("transcribe", ensureTrailingSlash(baseUrl));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    cache: "no-store",
  });

  const payload = (await response.json()) as LocalServiceResponse;

  if (!response.ok) {
    throw new Error(
      payload.error || payload.detail || "Local transcription service failed"
    );
  }

  return {
    transcriptionData: payload.transcriptionData ?? [],
    model: payload.model ?? request.model ?? request.provider,
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
