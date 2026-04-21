export const MAX_AUDIO_CONTENT_LENGTH = 10 * 1024 * 1024;

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
