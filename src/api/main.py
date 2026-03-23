import json
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
from groq import AsyncGroq

from src.agents import RECAP_PROMPT
from src.config import GROQ_API_KEY, GROQ_MODEL, WHISPER_MODEL

app = FastAPI(title="Quick Recap")

VALIDATE_PROMPT = """You are a text validator. The user will give you some text.
Reply with ONLY "yes" or "no".
Reply "yes" if the text contains meaningful content that can be summarized or rewritten.
Reply "no" if the text is:
- Random characters, gibberish, or keyboard mashing
- A single word or very short phrase with no real content
- Nonsensical or has no discernible meaning
When in doubt, reply "yes"."""


async def _transcribe(audio_bytes: bytes, filename: str) -> str:
    client = AsyncGroq(api_key=GROQ_API_KEY)
    with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=False) as f:
        f.write(audio_bytes)
        f.flush()
        transcription = await client.audio.transcriptions.create(
            file=(filename, open(f.name, "rb")),
            model=WHISPER_MODEL,
            response_format="text",
        )
    return transcription


async def _validate_text(text: str) -> bool:
    if len(text.strip()) < 20:
        return False
    client = AsyncGroq(api_key=GROQ_API_KEY)
    resp = await client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": VALIDATE_PROMPT},
            {"role": "user", "content": text[:500]},
        ],
        temperature=0.0,
        max_tokens=5,
    )
    return resp.choices[0].message.content.strip().lower().startswith("yes")


async def _stream_recap(text: str):
    client = AsyncGroq(api_key=GROQ_API_KEY)
    stream = await client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": RECAP_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0.3,
        max_tokens=2048,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def _run_recap(text: str):
    if not GROQ_API_KEY:
        yield {"data": json.dumps({"type": "error", "content": "No API key configured."})}
        return

    if len(text.strip()) < 20:
        yield {"data": json.dumps({"type": "error", "content": "Text is too short. Please provide more content."})}
        return

    if len(text) > 10000:
        text = text[:10000]

    try:
        valid = await _validate_text(text)
        if not valid:
            yield {"data": json.dumps({"type": "error", "content": "The input doesn't contain meaningful content to recap. Please provide real text or a voice recording."})}
            return
    except Exception:
        pass

    try:
        async for chunk in _stream_recap(text):
            yield {"data": json.dumps({"type": "chunk", "content": chunk})}
    except Exception as e:
        msg = str(e)
        if "rate_limit" in msg.lower() or "429" in msg:
            yield {"data": json.dumps({"type": "error", "content": "Service is busy. Please wait a moment and try again."})}
        else:
            yield {"data": json.dumps({"type": "error", "content": "Something went wrong. Please try again."})}
        return

    yield {"data": json.dumps({"type": "done"})}


@app.post("/api/analyze")
async def analyze_text(text: str = Form(...)):
    return EventSourceResponse(_run_recap(text))


@app.post("/api/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    if not GROQ_API_KEY:
        return {"error": "No API key configured."}
    audio_bytes = await audio.read()
    try:
        transcript = await _transcribe(audio_bytes, audio.filename or "audio.webm")
    except Exception:
        return {"error": "Transcription failed. Please try again."}
    return {"transcript": transcript}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def index():
    return FileResponse("frontend/index.html")
