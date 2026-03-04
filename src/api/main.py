import asyncio
import json
from fastapi import FastAPI, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
from groq import AsyncGroq
from src.agents import ANALYZERS
from src.config import GROQ_API_KEY, GROQ_MODEL

app = FastAPI(title="QuickRecap")


async def _stream_analysis(agent_key, text):
    agent = ANALYZERS[agent_key]
    client = AsyncGroq(api_key=GROQ_API_KEY)
    messages = [
        {"role": "system", "content": agent["prompt"]},
        {"role": "user", "content": text},
    ]
    stream = await client.chat.completions.create(
        model=GROQ_MODEL, messages=messages, temperature=0.3, max_tokens=1024, stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def _run_analysis(text):
    if not GROQ_API_KEY:
        yield {"data": json.dumps({"type": "error", "content": "No GROQ_API_KEY configured."})}
        return
    if len(text.strip()) < 20:
        yield {"data": json.dumps({"type": "error", "content": "Text is too short to analyze."})}
        return

    queues = {k: asyncio.Queue() for k in ANALYZERS}

    async def agent_worker(key):
        try:
            async for chunk in _stream_analysis(key, text):
                await queues[key].put(chunk)
        except Exception as e:
            await queues[key].put(f"[Error: {e}]")
        await queues[key].put(None)

    tasks = [asyncio.create_task(agent_worker(k)) for k in ANALYZERS]
    active = set(ANALYZERS.keys())
    while active:
        for key in list(active):
            try:
                chunk = queues[key].get_nowait()
                if chunk is None:
                    active.discard(key)
                else:
                    yield {"data": json.dumps({"type": "chunk", "agent": key, "content": chunk})}
            except asyncio.QueueEmpty:
                pass
        if active:
            await asyncio.sleep(0.02)
    await asyncio.gather(*tasks)
    yield {"data": json.dumps({"type": "done"})}


@app.post("/api/analyze")
async def analyze_text(text: str = Form(...)):
    return EventSourceResponse(_run_analysis(text))


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def index():
    return FileResponse("frontend/index.html")
