let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let transcriptReady = "";
let isRecording = false;

function get(selector) { return document.querySelector(selector); }

function updateCharCount() {
    let len = get("#text-input").value.length;
    let counter = get("#char-count");
    counter.textContent = len.toLocaleString() + " / 10,000";
    counter.classList.remove("near-limit", "at-limit");
    if (len >= 10000) counter.classList.add("at-limit");
    else if (len >= 8000) counter.classList.add("near-limit");
}

function setStatus(text, show) {
    if (show === undefined) show = true;
    get("#status-text").textContent = text;
    get("#status-bar").style.display = show ? "block" : "none";
}

function formatTime(s) {
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function updateAnalyzeBtn() {
    let hasText = get("#text-input").value.trim().length > 0;
    get("#analyze-btn").disabled = !(hasText || transcriptReady.length > 0);
}

function resetText() {
    get("#text-input").value = "";
    updateCharCount();
    updateAnalyzeBtn();
    get("#text-input").focus();
}

function resetVoice() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        mediaRecorder = null;
    }
    audioChunks = [];
    transcriptReady = "";
    recordingSeconds = 0;
    isRecording = false;
    clearInterval(recordingTimer);
    get("#record-label").textContent = "Record";
    get("#record-btn").classList.remove("recording");
    get("#recording-time").textContent = "";
    get("#transcript-preview").style.display = "none";
    get("#transcript-text").textContent = "";
    updateAnalyzeBtn();
}

async function toggleRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            recordingSeconds = 0;
            isRecording = true;

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

            mediaRecorder.onstop = async () => {
                mediaRecorder.stream.getTracks().forEach(t => t.stop());
                get("#record-btn").classList.remove("recording");
                clearInterval(recordingTimer);
                isRecording = false;

                if (audioChunks.length === 0) {
                    get("#record-label").textContent = "Record";
                    updateAnalyzeBtn();
                    return;
                }

                if (recordingSeconds < 3) {
                    setStatus("Recording too short. Speak for at least 3 seconds.");
                    get("#record-label").textContent = "Record";
                    updateAnalyzeBtn();
                    return;
                }

                let blob = new Blob(audioChunks, { type: "audio/webm" });
                setStatus("Transcribing audio...");
                get("#record-label").textContent = "Record";

                let fd = new FormData();
                fd.append("audio", blob, "recording.webm");

                try {
                    let resp = await fetch("/api/transcribe", { method: "POST", body: fd });
                    let data = await resp.json();
                    if (data.error) {
                        setStatus("Transcription failed. Try again.");
                        updateAnalyzeBtn();
                        return;
                    }
                    transcriptReady = data.transcript;
                    get("#transcript-text").textContent = transcriptReady;
                    get("#transcript-preview").style.display = "block";
                    setStatus("Transcript ready. Hit Recap when you're done.");
                    setTimeout(() => setStatus("", false), 3000);
                } catch {
                    setStatus("Transcription failed. Try again.");
                }
                updateAnalyzeBtn();
            };

            mediaRecorder.start();
            get("#record-label").textContent = "Pause";
            get("#record-btn").classList.add("recording");
            setStatus("", false);
            recordingTimer = setInterval(() => {
                if (isRecording) {
                    recordingSeconds++;
                    get("#recording-time").textContent = formatTime(recordingSeconds);
                }
            }, 1000);
        } catch {
            setStatus("Microphone access denied.");
        }
    } else if (mediaRecorder.state === "recording") {
        mediaRecorder.pause();
        isRecording = false;
        get("#record-label").textContent = "Resume";
        get("#record-btn").classList.remove("recording");
    } else if (mediaRecorder.state === "paused") {
        mediaRecorder.resume();
        isRecording = true;
        get("#record-label").textContent = "Pause";
        get("#record-btn").classList.add("recording");
    }
}

async function analyze() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        return new Promise(resolve => {
            mediaRecorder.onstop = async () => {
                mediaRecorder.stream.getTracks().forEach(t => t.stop());
                get("#record-btn").classList.remove("recording");
                clearInterval(recordingTimer);
                isRecording = false;
                get("#record-label").textContent = "Record";

                if (audioChunks.length > 0 && recordingSeconds >= 3) {
                    let blob = new Blob(audioChunks, { type: "audio/webm" });
                    setStatus("Transcribing audio...");
                    let fd = new FormData();
                    fd.append("audio", blob, "recording.webm");
                    try {
                        let resp = await fetch("/api/transcribe", { method: "POST", body: fd });
                        let data = await resp.json();
                        if (!data.error) {
                            transcriptReady = data.transcript;
                            get("#transcript-text").textContent = transcriptReady;
                            get("#transcript-preview").style.display = "block";
                        }
                    } catch {}
                }
                await doRecap();
                resolve();
            };
            mediaRecorder.stop();
        });
    }
    await doRecap();
}

async function doRecap() {
    let textInput = get("#text-input").value.trim();
    let text = textInput || transcriptReady;

    if (!text) { setStatus("Paste some text or record your voice first."); return; }
    if (text.length < 20) { setStatus("Text is too short. Give it a bit more content."); return; }

    get("#result-body").textContent = "";
    get("#result-body").classList.add("typing-cursor");
    get("#result-section").style.display = "block";
    get("#analyze-btn").disabled = true;
    setStatus("Processing...");

    let fd = new FormData();
    fd.append("text", text);

    try {
        let response = await fetch("/api/analyze", { method: "POST", body: fd });
        let reader = response.body.getReader();
        let decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
            let { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split("\n");
            buffer = lines.pop();

            for (let line of lines) {
                if (!line.startsWith("data:")) continue;
                let raw = line.slice(5).trim();
                if (!raw) continue;
                let ev;
                try { ev = JSON.parse(raw); } catch { continue; }

                if (ev.type === "chunk") {
                    get("#result-body").textContent += ev.content;
                } else if (ev.type === "error") {
                    setStatus(ev.content);
                    get("#result-body").classList.remove("typing-cursor");
                    updateAnalyzeBtn();
                    return;
                } else if (ev.type === "done") {
                    get("#result-body").classList.remove("typing-cursor");
                    setStatus("", false);
                }
            }
        }
    } catch {
        setStatus("Connection error. Try again.");
    }

    updateAnalyzeBtn();
}

document.addEventListener("DOMContentLoaded", function() {
    get("#text-input").focus();
    get("#text-input").addEventListener("input", function() { updateCharCount(); updateAnalyzeBtn(); });
    updateAnalyzeBtn();
});
