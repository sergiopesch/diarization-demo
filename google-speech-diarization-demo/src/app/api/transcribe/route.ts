import { NextRequest, NextResponse } from "next/server";
import { SpeechClient, protos } from "@google-cloud/speech";

export async function POST(req: NextRequest) {
    try {
        const { audioContent } = await req.json();
        if (!audioContent) {
            return NextResponse.json({ error: "No audioContent provided" }, { status: 400 });
        }

        // Load credentials (if needed)
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || "{}");
        const client = new SpeechClient({ credentials });

        const request = {
            audio: { content: audioContent },
            config: {
                encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS,
                sampleRateHertz: 48000,
                languageCode: "en-US",
                enableSpeakerDiarization: true,
                diarizationSpeakerCount: 2,
            },
        };

        // Remove any & void or extra expression
        const [response] = await client.recognize(request);

        const transcriptionData: { word: string; speaker: number }[] = [];

        if (response.results) {
            response.results.forEach((result: any) => {
                const alt = result.alternatives?.[0];
                alt?.words?.forEach((wordInfo: any) => {
                    transcriptionData.push({
                        word: wordInfo.word || "",
                        speaker: wordInfo.speakerTag || 0,
                    });
                });
            });
        }

        return NextResponse.json({ transcriptionData });
    } catch (error: any) {
        console.error("Transcription error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
