import asyncio
import json
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
from groq import AsyncGroq

from src.agents import ANALYZERS
from src.config import GROQ_API_KEY, GROQ_MODEL, WHISPER_MODEL

app = FastAPI(title="QuickRecap")


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


async def _stream_analysis(agent_key: str, text: str):
    """Stream one analysis agent's output."""
    agent = ANALYZERS[agent_key]
    client = AsyncGroq(api_key=GROQ_API_KEY)
    messages = [
        {"role": "system", "content": agent["prompt"]},
        {"role": "user", "content": text},
    ]
    stream = await client.chat.completions.create(
        model=GROQ_MODEL,
        messages=messages,
        temperature=0.3,
        max_tokens=1024,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def _run_analysis(text: str):
    """Run all 5 agents in parallel, yielding SSE events."""
    if not GROQ_API_KEY:
        yield {"data": json.dumps({"type": "error", "content": "No GROQ_API_KEY configured."})}
        return

    if len(text.strip()) < 20:
        yield {"data": json.dumps({"type": "error", "content": "Text is too short to analyze. Please provide more content."})}
        return

    if len(text) > 10000:
        text = text[:10000]

    # start all agents concurrently
    queues: dict[str, asyncio.Queue] = {k: asyncio.Queue() for k in ANALYZERS}

    async def agent_worker(key: str):
        try:
            async for chunk in _stream_analysis(key, text):
                await queues[key].put(chunk)
        except Exception as e:
            msg = str(e)
            if "rate_limit" in msg.lower() or "429" in msg:
                await queues[key].put("Rate limit reached. Please wait a moment and try again.")
            else:
                await queues[key].put(f"Analysis failed. Please try again.")
        await queues[key].put(None)  # sentinel

    tasks = [asyncio.create_task(agent_worker(k)) for k in ANALYZERS]

    # yield chunks as they come from any agent
    active = set(ANALYZERS.keys())
    while active:
        for key in list(active):
            try:
                chunk = queues[key].get_nowait()
                if chunk is None:
                    active.discard(key)
                else:
                    yield {
                        "data": json.dumps({
                            "type": "chunk",
                            "agent": key,
                            "content": chunk,
                        })
                    }
            except asyncio.QueueEmpty:
                pass
        if active:
            await asyncio.sleep(0.02)

    await asyncio.gather(*tasks)
    yield {"data": json.dumps({"type": "done"})}


@app.post("/api/analyze")
async def analyze_text(text: str = Form(...)):
    return EventSourceResponse(_run_analysis(text))


@app.post("/api/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    if not GROQ_API_KEY:
        return {"error": "No GROQ_API_KEY configured."}
    audio_bytes = await audio.read()
    try:
        transcript = await _transcribe(audio_bytes, audio.filename or "audio.webm")
    except Exception as e:
        return {"error": f"Transcription failed: {e}"}
    return {"transcript": transcript}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def index():
    return FileResponse("frontend/index.html")
