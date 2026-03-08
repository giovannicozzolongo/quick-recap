const $ = (sel) => document.querySelector(sel);

let mediaRecorder = null;
let audioChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;
let transcriptReady = "";
let isPaused = false;

function updateCharCount() {
    const len = $("#text-input").value.length;
    const el = $("#char-count");
    el.textContent = `${len.toLocaleString()} / 10,000`;
    el.classList.remove("near-limit", "at-limit");
    if (len >= 10000) {
        el.classList.add("at-limit");
    } else if (len >= 8000) {
        el.classList.add("near-limit");
    }
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

function resetText() {
    $("#text-input").value = "";
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
    clearInterval(recordingTimer);
    $("#record-label").textContent = "Record";
    $("#record-btn").classList.remove("recording");
    $("#pause-btn").style.display = "none";
    $("#stop-btn").style.display = "none";
    $("#recording-time").textContent = "";
    $("#transcript-preview").style.display = "none";
    $("#transcript-text").textContent = "";
}

async function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        // already recording, do nothing (use pause/stop)
        return;
    }
    if (mediaRecorder && mediaRecorder.state === "paused") {
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        recordingSeconds = 0;
        isPaused = false;

        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            $("#record-btn").classList.remove("recording");
            $("#pause-btn").style.display = "none";
            $("#stop-btn").style.display = "none";
            clearInterval(recordingTimer);

            if (audioChunks.length === 0) return;

            if (recordingSeconds < 3) {
                setStatus("Recording too short. Please speak for at least 3 seconds.");
                $("#record-label").textContent = "Record";
                return;
            }

            const blob = new Blob(audioChunks, { type: "audio/webm" });
            setStatus("Transcribing audio...");
            $("#analyze-btn").disabled = true;

            const formData = new FormData();
            formData.append("audio", blob, "recording.webm");

            try {
                const resp = await fetch("/api/transcribe", {
                    method: "POST",
                    body: formData,
                });
                const data = await resp.json();
                if (data.error) {
                    setStatus(`Error: ${data.error}`);
                    return;
                }
                transcriptReady = data.transcript;
                $("#transcript-text").textContent = transcriptReady;
                $("#transcript-preview").style.display = "block";
                setStatus("", false);
            } catch (err) {
                setStatus(`Transcription failed: ${err.message}`);
            }
            $("#analyze-btn").disabled = false;
            $("#record-label").textContent = "Record";
        };

        mediaRecorder.start();
        $("#record-label").textContent = "Recording...";
        $("#record-btn").classList.add("recording");
        $("#pause-btn").style.display = "flex";
        $("#pause-btn").querySelector("#pause-label").textContent = "Pause";
        $("#stop-btn").style.display = "flex";
        recordingTimer = setInterval(() => {
            if (!isPaused) {
                recordingSeconds++;
                $("#recording-time").textContent = formatTime(recordingSeconds);
            }
        }, 1000);
    } catch (err) {
        setStatus(`Microphone access denied: ${err.message}`);
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

function parseQuiz(raw) {
    const questions = [];
    const blocks = raw.split(/Q\d+:/);
    for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.trim().split("\n").filter((l) => l.trim());
        if (lines.length < 2) continue;

        const qText = lines[0].trim();
        const options = [];
        let answer = "";

        for (const line of lines.slice(1)) {
            const optMatch = line.match(/^([A-D])\)\s*(.+)/);
            const ansMatch = line.match(/^Answer:\s*([A-D])/i);
            if (optMatch) {
                options.push({ letter: optMatch[1], text: optMatch[2].trim() });
            } else if (ansMatch) {
                answer = ansMatch[1];
            }
        }

        if (qText && options.length >= 2 && answer) {
            questions.push({ question: qText, options, answer });
        }
    }
    return questions;
}

function renderQuiz(raw) {
    const questions = parseQuiz(raw);
    const container = $("#body-quiz");
    container.textContent = "";
    container.style.whiteSpace = "normal";

    if (questions.length === 0) {
        container.textContent = raw;
        return;
    }

    questions.forEach((q, i) => {
        const div = document.createElement("div");
        div.className = "quiz-question";

        const qEl = document.createElement("div");
        qEl.className = "quiz-q";
        qEl.textContent = `${i + 1}. ${q.question}`;
        div.appendChild(qEl);

        let answered = false;

        q.options.forEach((opt) => {
            const btn = document.createElement("button");
            btn.className = "quiz-option";
            btn.textContent = `${opt.letter}) ${opt.text}`;
            btn.onclick = () => {
                if (answered) return;
                answered = true;
                div.querySelectorAll(".quiz-option").forEach((b) => {
                    b.disabled = true;
                    const letter = b.textContent.charAt(0);
                    if (letter === q.answer) {
                        b.classList.add("correct");
                    }
                });
                if (opt.letter !== q.answer) {
                    btn.classList.add("wrong");
                }
            };
            div.appendChild(btn);
        });

        container.appendChild(div);
    });
}

async function analyze() {
    const hasTranscript = transcriptReady.length > 0;
    const textInput = $("#text-input").value.trim();
    const text = textInput || transcriptReady;

    if (!text) {
        $("#text-input").focus();
        return;
    }

    // reset cards
    const agents = ["summary", "key_points", "action_items", "questions", "quiz"];
    for (const key of agents) {
        $(`#body-${key}`).textContent = "";
        $(`#body-${key}`).style.whiteSpace = "pre-wrap";
        $(`#body-${key}`).classList.add("typing-cursor");
    }
    $("#results-grid").style.display = "grid";
    $("#analyze-btn").disabled = true;
    setStatus("5 agents analyzing in parallel...");

    const formData = new FormData();
    formData.append("text", text);

    let quizRaw = "";

    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            body: formData,
        });

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
                    if (ev.agent === "quiz") {
                        quizRaw += ev.content;
                        $(`#body-quiz`).textContent = quizRaw;
                    } else {
                        const body = $(`#body-${ev.agent}`);
                        if (body) body.textContent += ev.content;
                    }
                } else if (ev.type === "error") {
                    setStatus(`Error: ${ev.content}`);
                    $("#analyze-btn").disabled = false;
                    return;
                } else if (ev.type === "done") {
                    for (const key of agents) {
                        $(`#body-${key}`).classList.remove("typing-cursor");
                    }
                    renderQuiz(quizRaw);
                    setStatus("", false);
                }
            }
        }
    } catch (err) {
        setStatus(`Connection error: ${err.message}`);
    }

    $("#analyze-btn").disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
    $("#text-input").focus();
});
