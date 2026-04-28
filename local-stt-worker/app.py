import base64
import binascii
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="local-stt-worker")

MAX_AUDIO_CONTENT_LENGTH = 10 * 1024 * 1024
DEFAULT_MAX_AUDIO_BYTES = 8 * 1024 * 1024


class TranscriptionRequest(BaseModel):
    audioContent: str = Field(..., min_length=1, max_length=MAX_AUDIO_CONTENT_LENGTH)
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


class WarmupRequest(BaseModel):
    model: str | None = None
    languageCode: str = "en-US"


class WarmupResponse(BaseModel):
    model: str
    languageCode: str
    device: str
    computeType: str
    asrLoaded: bool
    alignmentLoaded: bool
    diarizationLoaded: bool


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


def require_worker_api_key(
    x_worker_api_key: Annotated[str | None, Header()] = None,
) -> None:
    expected_api_key = os.getenv("LOCAL_WORKER_API_KEY")

    if not expected_api_key:
        return

    if x_worker_api_key != expected_api_key:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing worker API key",
        )


@app.post("/warmup", response_model=WarmupResponse)
def warmup(
    request: WarmupRequest,
    _: Annotated[None, Depends(require_worker_api_key)],
) -> WarmupResponse:
    torch, _ = require_whisperx_dependencies()
    device = get_device(torch)
    compute_type = get_compute_type(device)
    model_name = request.model or os.getenv("WHISPERX_MODEL", "tiny.en")
    language_code = normalize_language_code(request.languageCode)

    get_whisperx_model(model_name, device, compute_type)
    get_whisperx_alignment_model(language_code, device)

    hf_token = os.getenv("PYANNOTE_AUTH_TOKEN")
    diarization_loaded = False

    if hf_token:
        get_whisperx_diarization_pipeline(device, hf_token)
        diarization_loaded = True

    return WarmupResponse(
        model=model_name,
        languageCode=language_code,
        device=device,
        computeType=compute_type,
        asrLoaded=True,
        alignmentLoaded=True,
        diarizationLoaded=diarization_loaded,
    )


@app.post("/transcribe", response_model=TranscriptionResponse)
def transcribe(
    request: TranscriptionRequest,
    _: Annotated[None, Depends(require_worker_api_key)],
) -> TranscriptionResponse:
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
    torch, whisperx = require_whisperx_dependencies()

    device = get_device(torch)
    compute_type = get_compute_type(device)
    model_name = request.model or os.getenv("WHISPERX_MODEL", "tiny.en")
    hf_token = os.getenv("PYANNOTE_AUTH_TOKEN")
    language_code = normalize_language_code(request.languageCode)

    if not hf_token:
        raise HTTPException(
            status_code=500,
            detail=(
                "PYANNOTE_AUTH_TOKEN is required for WhisperX diarization. "
                "Accept the gated pyannote model terms on Hugging Face, then "
                "set the token in the worker environment."
            ),
        )

    with write_temp_audio(request.audioContent) as audio_path:
        audio = whisperx.load_audio(str(audio_path))

        model = get_whisperx_model(model_name, device, compute_type)
        result = model.transcribe(audio, batch_size=8, language=language_code)

        align_model, metadata = get_whisperx_alignment_model(
            result.get("language") or language_code,
            device,
        )
        aligned_result = whisperx.align(
            result["segments"],
            align_model,
            metadata,
            audio,
            device,
            return_char_alignments=False,
        )

        diarization_pipeline = get_whisperx_diarization_pipeline(device, hf_token)
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


def require_whisperx_dependencies():
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

    return torch, whisperx


def get_device(torch) -> str:
    return os.getenv(
        "LOCAL_STT_DEVICE",
        "cuda" if torch.cuda.is_available() else "cpu",
    )


def get_compute_type(device: str) -> str:
    return "float16" if device == "cuda" else "int8"


@lru_cache(maxsize=4)
def get_whisperx_model(model_name: str, device: str, compute_type: str):
    _, whisperx = require_whisperx_dependencies()
    return whisperx.load_model(model_name, device, compute_type=compute_type)


@lru_cache(maxsize=8)
def get_whisperx_alignment_model(language_code: str, device: str):
    _, whisperx = require_whisperx_dependencies()
    return whisperx.load_align_model(language_code=language_code, device=device)


@lru_cache(maxsize=2)
def get_whisperx_diarization_pipeline(device: str, hf_token: str):
    _, whisperx = require_whisperx_dependencies()
    return whisperx.DiarizationPipeline(token=hf_token, device=device)


def normalize_language_code(language_code: str) -> str:
    normalized = language_code.strip().lower()

    if not normalized:
        return "en"

    return normalized.split("-", maxsplit=1)[0]


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
    try:
        audio_bytes = base64.b64decode(audio_content, validate=True)
    except binascii.Error as exc:
        raise HTTPException(
            status_code=400,
            detail="audioContent must be a valid base64 string",
        ) from exc

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio bytes were provided")

    max_audio_bytes = get_max_audio_bytes()

    if len(audio_bytes) > max_audio_bytes:
        raise HTTPException(
            status_code=413,
            detail="Audio payload is too large for synchronous transcription",
        )

    fd, temp_path = tempfile.mkstemp(suffix=".webm")
    os.close(fd)
    path = Path(temp_path)
    path.write_bytes(audio_bytes)
    return TempAudioFile(path)


def get_max_audio_bytes() -> int:
    configured_limit = os.getenv("LOCAL_STT_MAX_AUDIO_BYTES")

    if not configured_limit:
        return DEFAULT_MAX_AUDIO_BYTES

    try:
        value = int(configured_limit)
    except ValueError:
        return DEFAULT_MAX_AUDIO_BYTES

    return value if value > 0 else DEFAULT_MAX_AUDIO_BYTES
