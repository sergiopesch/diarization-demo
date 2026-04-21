export const MAX_AUDIO_CONTENT_LENGTH = 10 * 1024 * 1024;
export const DEFAULT_LANGUAGE_CODE = "en-US";
export const DEFAULT_SPEAKER_COUNT = 2;
export const DEFAULT_TRANSCRIPTION_PROVIDER = "google";

export const SUPPORTED_TRANSCRIPTION_PROVIDERS = [
  "google",
  "whisperx",
  "parakeet-pyannote",
  "nemo",
] as const;

export type TranscriptionProvider =
  (typeof SUPPORTED_TRANSCRIPTION_PROVIDERS)[number];

export type TranscriptWord = {
  word: string;
  speaker: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
};

export type NormalizedTranscriptionRequest = {
  audioContent: string;
  provider: TranscriptionProvider;
  model: string | null;
  languageCode: string;
  speakerCount: number;
};

export function validateAudioContent(audioContent: unknown): string | null {
  if (!audioContent) {
    return "No audioContent provided";
  }

  if (typeof audioContent !== "string") {
    return "audioContent must be a base64 string";
  }

  if (audioContent.length > MAX_AUDIO_CONTENT_LENGTH) {
    return "Audio payload is too large for synchronous transcription";
  }

  return null;
}

export function isTranscriptionProvider(
  value: unknown
): value is TranscriptionProvider {
  return (
    typeof value === "string" &&
    SUPPORTED_TRANSCRIPTION_PROVIDERS.includes(
      value as TranscriptionProvider
    )
  );
}

export function normalizeTranscriptionRequest(
  payload: unknown,
  fallbackProvider: TranscriptionProvider = DEFAULT_TRANSCRIPTION_PROVIDER
): { value: NormalizedTranscriptionRequest | null; error: string | null } {
  if (!payload || typeof payload !== "object") {
    return {
      value: null,
      error: "Request body must be a JSON object",
    };
  }

  const candidate = payload as Record<string, unknown>;
  const audioError = validateAudioContent(candidate.audioContent);

  if (audioError) {
    return { value: null, error: audioError };
  }

  if (
    candidate.provider !== undefined &&
    !isTranscriptionProvider(candidate.provider)
  ) {
    return {
      value: null,
      error: `provider must be one of ${SUPPORTED_TRANSCRIPTION_PROVIDERS.join(", ")}`,
    };
  }

  if (candidate.model !== undefined && typeof candidate.model !== "string") {
    return {
      value: null,
      error: "model must be a string when provided",
    };
  }

  if (
    candidate.languageCode !== undefined &&
    typeof candidate.languageCode !== "string"
  ) {
    return {
      value: null,
      error: "languageCode must be a string when provided",
    };
  }

  if (
    candidate.speakerCount !== undefined &&
    (!Number.isInteger(candidate.speakerCount) ||
      Number(candidate.speakerCount) < 1 ||
      Number(candidate.speakerCount) > 8)
  ) {
    return {
      value: null,
      error: "speakerCount must be an integer between 1 and 8",
    };
  }

  return {
    value: {
      audioContent: candidate.audioContent as string,
      provider: (candidate.provider as TranscriptionProvider) ?? fallbackProvider,
      model: typeof candidate.model === "string" ? candidate.model : null,
      languageCode:
        typeof candidate.languageCode === "string"
          ? candidate.languageCode
          : DEFAULT_LANGUAGE_CODE,
      speakerCount:
        typeof candidate.speakerCount === "number"
          ? candidate.speakerCount
          : DEFAULT_SPEAKER_COUNT,
    },
    error: null,
  };
}
