import base64
import os
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="local-stt-worker")


class TranscriptionRequest(BaseModel):
    audioContent: str = Field(..., min_length=1)
    provider: Literal["whisperx", "parakeet-pyannote", "nemo"]
    model: str | None = None
    languageCode: str = "en-US"
    speakerCount: int = Field(default=2, ge=1, le=8)


class TranscriptWord(BaseModel):
    word: str
    speaker: int
    startSeconds: float | None = None
    endSeconds: float | None = None


class TranscriptionResponse(BaseModel):
    transcriptionData: list[TranscriptWord]
    model: str


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe", response_model=TranscriptionResponse)
def transcribe(request: TranscriptionRequest) -> TranscriptionResponse:
    if request.provider == "whisperx":
        return transcribe_with_whisperx(request)

    if request.provider == "parakeet-pyannote":
        raise HTTPException(
            status_code=501,
            detail=(
                "parakeet-pyannote is scaffolded in the Next app but not yet "
                "implemented in the local worker. Use whisperx first, then add "
                "a Parakeet ASR path behind the same response schema."
            ),
        )

    if request.provider == "nemo":
        raise HTTPException(
            status_code=501,
            detail=(
                "nemo is scaffolded in the Next app but not yet implemented in "
                "the local worker. Add a NeMo diarization pipeline when you are "
                "ready to evaluate Sortformer or MSDD."
            ),
        )

    raise HTTPException(status_code=400, detail="Unsupported provider")


def transcribe_with_whisperx(
    request: TranscriptionRequest,
) -> TranscriptionResponse:
    try:
        import torch
        import whisperx
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "whisperx dependencies are not installed in the local worker. "
                "Install local-stt-worker/requirements.txt first."
            ),
        ) from exc

    device = os.getenv(
        "LOCAL_STT_DEVICE",
        "cuda" if torch.cuda.is_available() else "cpu",
    )
    compute_type = "float16" if device == "cuda" else "int8"
    model_name = request.model or os.getenv("WHISPERX_MODEL", "large-v3-turbo")
    hf_token = os.getenv("PYANNOTE_AUTH_TOKEN")

    with write_temp_audio(request.audioContent) as audio_path:
        audio = whisperx.load_audio(str(audio_path))

        model = whisperx.load_model(model_name, device, compute_type=compute_type)
        result = model.transcribe(audio, batch_size=8, language=request.languageCode)

        align_model, metadata = whisperx.load_align_model(
            language_code=result["language"],
            device=device,
        )
        aligned_result = whisperx.align(
            result["segments"],
            align_model,
            metadata,
            audio,
            device,
            return_char_alignments=False,
        )

        if not hf_token:
            raise HTTPException(
                status_code=500,
                detail=(
                    "PYANNOTE_AUTH_TOKEN is required for WhisperX diarization. "
                    "Accept the gated pyannote model terms on Hugging Face, then "
                    "set the token in the worker environment."
                ),
            )

        diarization_pipeline = whisperx.DiarizationPipeline(
            token=hf_token,
            device=device,
        )
        diarize_segments = diarization_pipeline(
            str(audio_path),
            min_speakers=request.speakerCount,
            max_speakers=request.speakerCount,
        )
        speaker_assigned = whisperx.assign_word_speakers(
            diarize_segments,
            aligned_result,
        )

    words: list[TranscriptWord] = []

    for segment in speaker_assigned.get("segments", []):
        for word in segment.get("words", []):
            token = (word.get("word") or "").strip()
            if not token:
                continue

            speaker_label = (
                word.get("speaker")
                or segment.get("speaker")
                or "SPEAKER_00"
            )
            speaker_number = parse_speaker_number(speaker_label)
            words.append(
                TranscriptWord(
                    word=token,
                    speaker=speaker_number,
                    startSeconds=word.get("start"),
                    endSeconds=word.get("end"),
                )
            )

    return TranscriptionResponse(
        transcriptionData=words,
        model=model_name,
    )


def parse_speaker_number(label: str) -> int:
    suffix = label.rsplit("_", maxsplit=1)[-1]
    return int(suffix) + 1 if suffix.isdigit() else 0


class TempAudioFile:
    def __init__(self, audio_path: Path):
        self.audio_path = audio_path

    def __enter__(self) -> Path:
        return self.audio_path

    def __exit__(self, exc_type, exc, tb) -> None:
        self.audio_path.unlink(missing_ok=True)


def write_temp_audio(audio_content: str) -> TempAudioFile:
    audio_bytes = base64.b64decode(audio_content)
    fd, temp_path = tempfile.mkstemp(suffix=".webm")
    os.close(fd)
    path = Path(temp_path)
    path.write_bytes(audio_bytes)
    return TempAudioFile(path)
