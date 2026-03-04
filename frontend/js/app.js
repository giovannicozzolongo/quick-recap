const $ = (sel) => document.querySelector(sel);
function setStatus(text, show = true) { $("#status-text").textContent = text; $("#status-bar").style.display = show ? "flex" : "none"; }
async function analyze() {
    const text = $("#text-input").value.trim();
    if (!text) { $("#text-input").focus(); return; }
    const agents = ["summary","key_points","action_items","questions","quiz"];
    for (const k of agents) { $(`#body-${k}`).textContent = ""; $(`#body-${k}`).classList.add("typing-cursor"); }
    $("#results-grid").style.display = "grid";
    $("#analyze-btn").disabled = true;
    setStatus("5 agents analyzing in parallel...");
    const formData = new FormData(); formData.append("text", text);
    try {
        const response = await fetch("/api/analyze", { method: "POST", body: formData });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); buffer = lines.pop();
            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const raw = line.slice(5).trim(); if (!raw) continue;
                let ev; try { ev = JSON.parse(raw); } catch { continue; }
                if (ev.type === "chunk") { const body = $(`#body-${ev.agent}`); if (body) body.textContent += ev.content; }
                else if (ev.type === "error") { setStatus("Error: " + ev.content); $("#analyze-btn").disabled = false; return; }
                else if (ev.type === "done") { for (const k of agents) $(`#body-${k}`).classList.remove("typing-cursor"); setStatus("", false); }
            }
        }
    } catch (err) { setStatus("Connection error: " + err.message); }
    $("#analyze-btn").disabled = false;
}
document.addEventListener("DOMContentLoaded", () => { $("#text-input").focus(); });
