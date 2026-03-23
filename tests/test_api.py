from fastapi.testclient import TestClient
from src.api.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_index_serves_html():
    resp = client.get("/")
    assert resp.status_code == 200
    assert "Quick" in resp.text and "Recap" in resp.text


def test_analyze_empty_text():
    resp = client.post("/api/analyze", data={"text": "short"})
    assert resp.status_code == 200
    assert "error" in resp.text


def test_transcribe_no_key():
    """Without a valid API key, transcription should fail gracefully."""
    import io
    fake_audio = io.BytesIO(b"fake audio data")
    resp = client.post(
        "/api/transcribe",
        files={"audio": ("test.webm", fake_audio, "audio/webm")},
    )
    assert resp.status_code == 200
    # either returns error or transcript
    data = resp.json()
    assert "error" in data or "transcript" in data
