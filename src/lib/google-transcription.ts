import { SpeechClient, protos } from "@google-cloud/speech";

import {
  type NormalizedTranscriptionRequest,
  type TranscriptWord,
} from "@/lib/transcription";

export async function transcribeWithGoogle(
  request: NormalizedTranscriptionRequest
): Promise<{ transcriptionData: TranscriptWord[]; model: string }> {
  const rawCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
  const client = new SpeechClient(
    rawCredentials ? { credentials: JSON.parse(rawCredentials) } : undefined
  );

  const [response] = await client.recognize({
    audio: { content: request.audioContent },
    config: {
      encoding:
        protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS,
      sampleRateHertz: 48000,
      languageCode: request.languageCode,
      enableAutomaticPunctuation: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: request.speakerCount,
        maxSpeakerCount: request.speakerCount,
      },
    },
  });

  const results = response.results ?? [];
  const finalAlternative = results.at(-1)?.alternatives?.[0];
  const transcriptionData =
    finalAlternative?.words?.map((wordInfo) => ({
      word: wordInfo.word || "",
      speaker: wordInfo.speakerTag || 0,
      startSeconds: toSeconds(wordInfo.startTime),
      endSeconds: toSeconds(wordInfo.endTime),
    })) ?? [];

  return {
    transcriptionData,
    model: request.model ?? "google-speech-default",
  };
}

function toSeconds(
  duration:
    | { seconds?: { toString(): string } | string | number | null; nanos?: number | null }
    | null
    | undefined
): number | null {
  if (!duration) {
    return null;
  }

  const seconds =
    duration.seconds === undefined || duration.seconds === null
      ? 0
      : Number(duration.seconds.toString());
  const nanos = duration.nanos ?? 0;

  return seconds + nanos / 1_000_000_000;
}
