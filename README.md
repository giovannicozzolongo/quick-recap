# Quick Recap

AI-powered text and voice recap. Paste or record, get a clean rewrite instantly.

**[Try it live](https://quick-recap-production.up.railway.app)** (free, no sign-up needed)

![Python](https://img.shields.io/badge/python-3.11+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![License](https://img.shields.io/badge/license-MIT-gray)

## What it does

1. You paste text or record audio via microphone
2. If audio, Whisper transcribes it to text
3. An LLM rewrites the content as a clean, well-structured text
4. The result streams in real time

It removes filler words, fixes grammar, organizes content logically, and writes in the dominant language of the input. Useful for meeting notes, voice memos, messy drafts, or any text that needs cleaning up.

## Architecture

```
Input (text or audio)
  |
  v
[Whisper STT] (if audio)
  |
  v
[Input validation]
  |
  v
[LLM recap] --> streamed to UI
```

## Tech stack

| Component | Tech |
|---|---|
| Backend | Python, FastAPI, SSE |
| Speech-to-text | Whisper Large v3 via Groq |
| Text processing | Llama 3.3 70B via Groq (free) |
| Frontend | Vanilla JS, CSS, MediaRecorder API |
| Streaming | Server-Sent Events |

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# get a free API key at https://console.groq.com
cp .env.example .env
# add your GROQ_API_KEY

make serve
# open http://localhost:8001
```

## Project structure

```
src/
  agents/
    analyzers.py    # recap prompt definition
  api/
    main.py         # FastAPI app, SSE streaming, transcription, validation
  config.py         # env vars and model config
frontend/
  index.html        # side-by-side text + voice input
  css/style.css     # dark green theme
  js/app.js         # SSE client, MediaRecorder, recording controls
tests/
  test_agents.py    # prompt tests
  test_api.py       # API endpoint tests
```

## License

MIT
