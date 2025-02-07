import { useState, useRef } from 'react';

export default function HomePage() {
  const [recording, setRecording] = useState(false);
  const [transcription, setTranscription] = useState<{ word: string; speaker: number }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setRecording(true);
    setTranscription([]);

    // Request mic access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm; codecs=opus',
    });
    mediaRecorderRef.current = mediaRecorder;

    // Collect data
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    // When recording stops, upload to server
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm; codecs=opus' });
      chunksRef.current = [];

      // Convert to base64
      const base64Audio = await blobToBase64(blob);

      // Send to /api/transcribe
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioContent: base64Audio }),
      });

      const data = await response.json();
      if (data.transcriptionData) {
        setTranscription(data.transcriptionData);
      } else {
        console.error(data.error || 'No transcription data');
      }
    };

    // Start recording
    mediaRecorder.start();
  };

  const stopRecording = () => {
    setRecording(false);
    mediaRecorderRef.current?.stop();
  };

  // Helper: Convert Blob -> Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // dataUrl = "data:audio/webm; codecs=opus;base64,xxxx..."
        const base64 = dataUrl.split(',')[1];
        resolve(base64 ?? '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  return (
    <main className="min-h-screen p-4 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-6">Google Speech Diarization Demo</h1>

      {!recording ? (
        <button
          onClick={startRecording}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
        >
          Start Recording
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
        >
          Stop Recording
        </button>
      )}

      {transcription.length > 0 && (
        <div className="mt-8 w-full max-w-xl bg-white shadow p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">Diarized Transcript</h2>
          <div className="flex flex-wrap gap-1 text-sm leading-6">
            {transcription.map((item, idx) => (
              <span
                key={idx}
                style={{ color: getColorForSpeaker(item.speaker) }}
                className="font-medium mr-1"
              >
                {item.word}
              </span>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function getColorForSpeaker(speaker: number) {
  // Just a simple mapping to different colors
  switch (speaker) {
    case 1:
      return '#1F75FE'; // speaker1: blue
    case 2:
      return '#FF5349'; // speaker2: red
    case 3:
      return '#FFA500'; // speaker3: orange
    default:
      return '#2E8B57'; // speaker4+ : greenish
  }
}
