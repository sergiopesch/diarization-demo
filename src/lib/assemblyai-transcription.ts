import { type TranscriptWord } from "@/lib/transcription";

const MAX_MEDIA_URL_LENGTH = 2048;
const DEFAULT_ASYNC_MODEL = "universal-3-pro";

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

export type AssemblyAITranscriptResponse = {
  id?: string;
  status?: string;
  error?: string;
  utterances?: AssemblyAIUtterance[];
};

export function validateMediaUrl(value: string): string | null {
  if (!value) {
    return "Enter a public audio or video URL";
  }

  if (value.length > MAX_MEDIA_URL_LENGTH) {
    return "Media URL is too long";
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return "Enter a valid media URL";
  }

  if (url.protocol !== "https:") {
    return "Media URL must start with https://";
  }

  if (url.username || url.password) {
    return "Media URL cannot include credentials";
  }

  if (url.port && url.port !== "443") {
    return "Media URL must use the default HTTPS port";
  }

  if (isPrivateHostname(url.hostname)) {
    return "Media URL must be publicly reachable";
  }

  return null;
}

export function getAsyncModel(value: unknown): string {
  return value === "universal-2" ? "universal-2" : DEFAULT_ASYNC_MODEL;
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

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  if (
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80")
  ) {
    return true;
  }

  const octets = normalized.split(".").map((part) => Number(part));

  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first = 0, second = 0] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function speakerNumber(label: string | undefined): number {
  if (!label) {
    return 0;
  }

  const firstLetter = label.trim().toUpperCase().charCodeAt(0);
  return firstLetter >= 65 && firstLetter <= 90 ? firstLetter - 64 : 0;
}
