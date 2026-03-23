const $ = (sel) => document.querySelector(sel);

let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let transcriptReady = "";
let isPaused = false;
let isRecording = false;

function updateCharCount() {
    const len = $("#text-input").value.length;
    const el = $("#char-count");
    el.textContent = `${len.toLocaleString()} / 10,000`;
    el.classList.remove("near-limit", "at-limit");
    if (len >= 10000) el.classList.add("at-limit");
    else if (len >= 8000) el.classList.add("near-limit");
}

function setStatus(text, show = true) {
    $("#status-text").textContent = text;
    $("#status-bar").style.display = show ? "flex" : "none";
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

function updateAnalyzeBtn() {
    const hasText = $("#text-input").value.trim().length > 0;
    const hasTranscript = transcriptReady.length > 0;
    $("#analyze-btn").disabled = !(hasText || hasTranscript) || isRecording;
}

function resetText() {
    $("#text-input").value = "";
    updateCharCount();
    updateAnalyzeBtn();
    $("#text-input").focus();
}

function resetVoice() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    audioChunks = [];
    transcriptReady = "";
    recordingSeconds = 0;
    isPaused = false;
    isRecording = false;
    clearInterval(recordingTimer);
    $("#record-label").textContent = "Record";
    $("#record-btn").classList.remove("recording");
    $("#pause-btn").style.display = "none";
    $("#stop-btn").style.display = "none";
    $("#recording-time").textContent = "";
    $("#transcript-preview").style.display = "none";
    $("#transcript-text").textContent = "";
    updateAnalyzeBtn();
}

async function toggleRecording() {
    if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        recordingSeconds = 0;
        isPaused = false;
        isRecording = true;
        updateAnalyzeBtn();

        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            $("#record-btn").classList.remove("recording");
            $("#pause-btn").style.display = "none";
            $("#stop-btn").style.display = "none";
            clearInterval(recordingTimer);
            isRecording = false;

            if (audioChunks.length === 0) {
                $("#record-label").textContent = "Record";
                updateAnalyzeBtn();
                return;
            }

            if (recordingSeconds < 3) {
                setStatus("Recording too short. Please speak for at least 3 seconds.");
                $("#record-label").textContent = "Record";
                updateAnalyzeBtn();
                return;
            }

            const blob = new Blob(audioChunks, { type: "audio/webm" });
            setStatus("Transcribing audio...");

            const formData = new FormData();
            formData.append("audio", blob, "recording.webm");

            try {
                const resp = await fetch("/api/transcribe", { method: "POST", body: formData });
                const data = await resp.json();
                if (data.error) {
                    setStatus("Transcription failed. Please try again.");
                    $("#record-label").textContent = "Record";
                    updateAnalyzeBtn();
                    return;
                }
                transcriptReady = data.transcript;
                $("#transcript-text").textContent = transcriptReady;
                $("#transcript-preview").style.display = "block";
                setStatus("Transcript ready. Click Recap when ready.");
                setTimeout(() => setStatus("", false), 3000);
            } catch {
                setStatus("Transcription failed. Please try again.");
            }
            $("#record-label").textContent = "Record";
            updateAnalyzeBtn();
        };

        mediaRecorder.start();
        $("#record-label").textContent = "Recording...";
        $("#record-btn").classList.add("recording");
        $("#pause-btn").style.display = "flex";
        $("#pause-label").textContent = "Pause";
        $("#stop-btn").style.display = "flex";
        setStatus("", false);
        recordingTimer = setInterval(() => {
            if (!isPaused) {
                recordingSeconds++;
                $("#recording-time").textContent = formatTime(recordingSeconds);
            }
        }, 1000);
    } catch {
        setStatus("Microphone access denied.");
        isRecording = false;
        updateAnalyzeBtn();
    }
}

function togglePause() {
    if (!mediaRecorder) return;
    if (mediaRecorder.state === "recording") {
        mediaRecorder.pause();
        isPaused = true;
        $("#pause-label").textContent = "Resume";
        $("#record-label").textContent = "Paused";
        $("#record-btn").classList.remove("recording");
    } else if (mediaRecorder.state === "paused") {
        mediaRecorder.resume();
        isPaused = false;
        $("#pause-label").textContent = "Pause";
        $("#record-label").textContent = "Recording...";
        $("#record-btn").classList.add("recording");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
}

async function analyze() {
    const textInput = $("#text-input").value.trim();
    const text = textInput || transcriptReady;

    if (!text) {
        setStatus("Paste some text or record your voice first.");
        return;
    }

    if (text.length < 20) {
        setStatus("Text is too short. Please provide more content.");
        return;
    }

    $("#result-body").textContent = "";
    $("#result-body").classList.add("typing-cursor");
    $("#result-section").style.display = "block";
    $("#analyze-btn").disabled = true;
    setStatus("Processing...");

    const formData = new FormData();
    formData.append("text", text);

    try {
        const response = await fetch("/api/analyze", { method: "POST", body: formData });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const raw = line.slice(5).trim();
                if (!raw) continue;
                let ev;
                try { ev = JSON.parse(raw); } catch { continue; }

                if (ev.type === "chunk") {
                    $("#result-body").textContent += ev.content;
                } else if (ev.type === "error") {
                    setStatus(ev.content);
                    $("#result-body").classList.remove("typing-cursor");
                    updateAnalyzeBtn();
                    return;
                } else if (ev.type === "done") {
                    $("#result-body").classList.remove("typing-cursor");
                    setStatus("", false);
                }
            }
        }
    } catch {
        setStatus("Connection error. Please try again.");
    }

    updateAnalyzeBtn();
}

document.addEventListener("DOMContentLoaded", () => {
    $("#text-input").focus();
    $("#text-input").addEventListener("input", () => { updateCharCount(); updateAnalyzeBtn(); });
    updateAnalyzeBtn();
});
