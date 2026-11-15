"""faster-whisper transcription sidecar.

Contract used by the Node API (services/transcription.ts):
POST /transcribe (multipart: file, language) -> {"text": "..."}
"""

import os
import tempfile

from fastapi import FastAPI, File, Form, UploadFile

app = FastAPI(title="UA Helper Whisper")

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")
_model = None  # lazy singleton


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        # int8 keeps CPU memory low; small is a good quality/speed balance
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE, "loaded": _model is not None}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("uk")):
    data = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        model = get_model()
        segments, info = model.transcribe(
            tmp_path,
            language=language,
            beam_size=2,
            vad_filter=True,
        )
        text = "".join(seg.text for seg in segments).strip()
        return {"text": text, "language": info.language, "duration": round(info.duration, 2)}
    finally:
        os.unlink(tmp_path)
