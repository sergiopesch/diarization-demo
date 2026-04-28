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

const DEFAULT_LOCAL_TRANSCRIPTION_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_LOCAL_TRANSCRIPTION_API_URL = "http://127.0.0.1:8000";

export class LocalTranscriptionServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502
  ) {
    super(message);
    this.name = "LocalTranscriptionServiceError";
  }
}

export async function transcribeWithLocalService(
  request: NormalizedTranscriptionRequest
): Promise<{ transcriptionData: TranscriptWord[]; model: string }> {
  const baseUrl =
    process.env.LOCAL_TRANSCRIPTION_API_URL ??
    DEFAULT_LOCAL_TRANSCRIPTION_API_URL;

  const endpoint = new URL("transcribe", ensureTrailingSlash(baseUrl));
  const timeoutMs = getLocalTranscriptionTimeoutMs();
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: getLocalServiceHeaders(),
      body: JSON.stringify(request),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new LocalTranscriptionServiceError(
        `Local transcription service timed out after ${Math.round(timeoutMs / 1000)} seconds`,
        504
      );
    }

    throw new LocalTranscriptionServiceError(
      error instanceof Error
        ? `Local transcription service is unavailable: ${error.message}`
        : "Local transcription service is unavailable"
    );
  }

  const payload = await readLocalServiceResponse(response);

  if (!response.ok) {
    throw new LocalTranscriptionServiceError(
      payload.error || payload.detail || "Local transcription service failed",
      response.status || 502
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

function getLocalTranscriptionTimeoutMs(): number {
  const configuredTimeoutMs = Number(process.env.LOCAL_TRANSCRIPTION_TIMEOUT_MS);

  return Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
    ? configuredTimeoutMs
    : DEFAULT_LOCAL_TRANSCRIPTION_TIMEOUT_MS;
}

function getLocalServiceHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.LOCAL_WORKER_API_KEY;

  if (apiKey) {
    headers["X-Worker-API-Key"] = apiKey;
  }

  return headers;
}

async function readLocalServiceResponse(
  response: Response
): Promise<LocalServiceResponse> {
  const body = await response.text();

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body) as LocalServiceResponse;
  } catch {
    if (!response.ok) {
      return {
        detail: `Local transcription service returned ${response.status} ${response.statusText}`,
      };
    }

    throw new LocalTranscriptionServiceError(
      "Local transcription service returned an invalid JSON response"
    );
  }
}
