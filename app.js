const recordButton = document.getElementById("recordButton");
const recordLabel = document.getElementById("recordLabel");
const statusText = document.getElementById("status");
const transcriptEl = document.getElementById("transcript");
const logList = document.getElementById("logList");
const downloadCsv = document.getElementById("downloadCsv");

const STORAGE_KEY = "voiceWorkoutLogs";
let isRecording = false;
let recognition = null;
let pendingTranscript = "";

const loadLogs = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Failed to parse logs", error);
    return [];
  }
};

const saveLogs = (logs) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
};

const renderLogs = (logs) => {
  logList.innerHTML = "";
  if (logs.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "log-item";
    emptyItem.innerHTML =
      '<span class="log-text">No logs yet. Try saying a workout.</span>';
    logList.appendChild(emptyItem);
    return;
  }

  logs
    .slice()
    .reverse()
    .forEach((log) => {
      const item = document.createElement("li");
      item.className = "log-item";

      const text = document.createElement("div");
      text.className = "log-text";
      text.textContent = log.text;

      const meta = document.createElement("div");
      meta.className = "log-meta";
      meta.textContent = log.timestamp;

      item.appendChild(text);
      item.appendChild(meta);
      logList.appendChild(item);
    });
};

const addLog = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return;
  const logs = loadLogs();
  logs.push({
    text: trimmed,
    timestamp: new Date().toLocaleString(),
  });
  saveLogs(logs);
  renderLogs(logs);
};

const setRecordingState = (recording) => {
  isRecording = recording;
  recordButton.classList.toggle("is-recording", recording);
  recordButton.setAttribute("aria-pressed", String(recording));
  recordLabel.textContent = recording ? "Stop Recording" : "Start Recording";
  statusText.textContent = recording
    ? "Listening... speak your workout."
    : "Ready to listen.";
};

const setupRecognition = () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    statusText.textContent =
      "Speech recognition is not supported in this browser.";
    recordButton.disabled = true;
    return null;
  }

  const recognizer = new SpeechRecognition();
  recognizer.continuous = false;
  recognizer.interimResults = true;
  recognizer.lang = "en-US";

  recognizer.onresult = (event) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        finalText += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }
    pendingTranscript = finalText.trim();
    transcriptEl.textContent = interim || finalText;
  };

  recognizer.onerror = (event) => {
    statusText.textContent = `Error: ${event.error}`;
    setRecordingState(false);
  };

  recognizer.onend = () => {
    setRecordingState(false);
    if (pendingTranscript) {
      addLog(pendingTranscript);
    }
    pendingTranscript = "";
    transcriptEl.textContent = "";
  };

  return recognizer;
};

const handleToggle = () => {
  if (!recognition) {
    recognition = setupRecognition();
  }

  if (!recognition) return;

  if (isRecording) {
    recognition.stop();
    return;
  }

  pendingTranscript = "";
  transcriptEl.textContent = "";
  setRecordingState(true);
  recognition.start();
};

const exportCsv = () => {
  const logs = loadLogs();
  if (logs.length === 0) return;

  const header = ["timestamp", "text"];
  const rows = logs.map((log) => [
    `"${log.timestamp.replace(/"/g, '""')}"`,
    `"${log.text.replace(/"/g, '""')}"`,
  ]);
  const csv = [header.join(","), ...rows.map((row) => row.join(","))].join(
    "\n"
  );

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "workout-logs.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

recordButton.addEventListener("click", handleToggle);
downloadCsv.addEventListener("click", exportCsv);

renderLogs(loadLogs());

