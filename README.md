# Quick Recap

Paste any text or record your voice. 5 AI agents analyze it simultaneously.

**[Try it live](https://quick-recap.onrender.com)** (free, no sign-up needed)

![Python](https://img.shields.io/badge/python-3.11+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![License](https://img.shields.io/badge/license-MIT-gray)

## What it does

1. You paste text or record audio via microphone
2. If audio, Whisper transcribes it to text
3. Five specialized AI agents analyze the text **in parallel**:
   - **Summary**: one-paragraph overview
   - **Key Points**: structured bullet points
   - **Action Items**: next steps and tasks
   - **Open Questions**: gaps and areas to explore
   - **Quiz**: multiple-choice questions to test understanding
4. All five results stream into the UI simultaneously

## Architecture

```
Input (text or audio)
  |
  v
[Whisper STT] (if audio)
  |
  v
Text ──┬──> Summary agent    ──> stream to UI
       ├──> Key Points agent  ──> stream to UI
       ├──> Action Items agent──> stream to UI
       ├──> Questions agent   ──> stream to UI
       └──> Quiz agent        ──> stream to UI
```

All 5 agents run as concurrent async tasks, each streaming via SSE.

## Tech stack

| Component | Tech |
|---|---|
| Backend | Python, FastAPI, SSE, asyncio |
| Speech-to-text | Whisper Large v3 via Groq |
| Text analysis | Llama 3.3 70B via Groq (free) |
| Frontend | Vanilla JS, CSS, MediaRecorder API |
| Streaming | Server-Sent Events with parallel sources |

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
    analyzers.py    # 5 agent definitions with prompts
  api/
    main.py         # FastAPI app, SSE streaming, transcription
  config.py         # env vars and model config
frontend/
  index.html        # two-tab input (text/voice) + results grid
  css/style.css     # dark theme dashboard
  js/app.js         # SSE client, MediaRecorder, parallel rendering
tests/
  test_agents.py    # agent definition tests
  test_api.py       # API endpoint tests
```

## License

MIT
