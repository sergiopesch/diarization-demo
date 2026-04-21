import { NextRequest, NextResponse } from "next/server";
import { SpeechClient, protos } from "@google-cloud/speech";

export async function POST(req: NextRequest) {
    try {
        const { audioContent } = await req.json();
        if (!audioContent) {
            return NextResponse.json({ error: "No audioContent provided" }, { status: 400 });
        }

        const rawCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS;
        const client = new SpeechClient(
            rawCredentials ? { credentials: JSON.parse(rawCredentials) } : undefined
        );

        const request = {
            audio: { content: audioContent },
            config: {
                encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS,
                sampleRateHertz: 48000,
                languageCode: "en-US",
                enableAutomaticPunctuation: true,
                diarizationConfig: {
                    enableSpeakerDiarization: true,
                    minSpeakerCount: 2,
                    maxSpeakerCount: 2,
                },
            },
        };

        const [response] = await client.recognize(request);
        const results = response.results ?? [];
        const finalAlternative = results.at(-1)?.alternatives?.[0];

        const transcriptionData =
            finalAlternative?.words?.map((wordInfo) => ({
                word: wordInfo.word || "",
                speaker: wordInfo.speakerTag || 0,
            })) ?? [];

        return NextResponse.json({ transcriptionData });
    } catch (error: unknown) {
        console.error("Transcription error:", error);
        const message = error instanceof Error ? error.message : "Unknown transcription error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
