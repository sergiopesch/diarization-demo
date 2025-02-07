import type { NextApiRequest, NextApiResponse } from 'next';
import { SpeechClient } from '@google-cloud/speech';

// Types for the response
type TranscriptionData = {
    word: string;
    speaker: number;
}[];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 1. Parse the request body
        const { audioContent } = req.body;
        if (!audioContent) {
            return res.status(400).json({ error: 'Missing audioContent' });
        }

        // 2. Set up Google Cloud client
        //    We read credentials from the env variable
        //    that contains the entire JSON for the service account.
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}');
        const client = new SpeechClient({ credentials });

        // 3. Build the recognition request
        //    We set the encoding to OGG_OPUS or WEBM_OPUS if we used MediaRecorder with OPUS.
        //    Opus can come in OGG or webm containers. We'll try 'WEBM_OPUS' first.
        const request = {
            audio: {
                content: audioContent,
            },
            config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,  // typical for webm opus from browser
                languageCode: 'en-US',
                enableSpeakerDiarization: true,
                diarizationSpeakerCount: 2, // or omit to auto-detect
                model: 'default',          // or 'video', 'phone_call', 'latest_long'
            },
        };
        // 4. Call the Speech-to-Text API
        const response = await client.recognize({
            audio: {
                content: audioContent,
            },
            config: {
                encoding: "WEBM_OPUS" as const,
                sampleRateHertz: 48000,
                languageCode: 'en-US',
                enableAutomaticPunctuation: true,
                enableWordTimeOffsets: true,
                diarizationConfig: {
                    enableSpeakerDiarization: true,
                    minSpeakerCount: 2,
                    maxSpeakerCount: 2
                },
                model: 'default',
            },
        }).then(([result]) => result);

        // 5. Extract words & speaker tags
        //    The API returns an array of `results`,
        //    each containing `alternatives`. We typically want the first alternative.
        //    Then look for `words` array, which has `speakerTag`.
        const transcriptionData: TranscriptionData = [];
        if (response.results) {
            response.results.forEach((result) => {
                const alternative = result.alternatives && result.alternatives[0];
                if (!alternative?.words) return;

                alternative.words.forEach((wordInfo) => {
                    transcriptionData.push({
                        word: wordInfo.word || '',
                        speaker: wordInfo.speakerTag || 0,
                    });
                });
            });
        }

        // 6. Return array of { word, speaker }
        return res.status(200).json({ transcriptionData });
    } catch (error: any) {
        console.error('Speech recognition error:', error);
        return res.status(500).json({ error: error.message });
    }
}
