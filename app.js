const recordButton = document.getElementById("recordButton");
const recordLabel = document.getElementById("recordLabel");
const statusText = document.getElementById("status");
const transcriptEl = document.getElementById("transcript");
const recorderSection = document.querySelector(".recorder");
const logList = document.getElementById("logList");
const downloadCsv = document.getElementById("downloadCsv");
const analyzeButton = document.getElementById("analyzeButton");
const openSettings = document.getElementById("openSettings");
const closeSettings = document.getElementById("closeSettings");
const settingsModal = document.getElementById("settingsModal");
let isRecording = false;
let recognition = null;
let pendingTranscript = "";
let latestTranscript = "";
let transcriptBuffer = "";
let currentLogs = [];

const setStatus = (message) => {
  statusText.textContent = message;
};

const getSupabaseClient = () => window.supabaseClient.getClient();

const setRecordingState = (recording) => {
  isRecording = recording;
  recordButton.classList.toggle("is-recording", recording);
  if (recorderSection) {
    recorderSection.classList.toggle("listening", recording);
  }
  recordButton.setAttribute("aria-pressed", String(recording));
  recordLabel.textContent = recording ? "Stop Recording" : "Start Recording";
  setStatus(recording ? "Listening... speak your workout." : "Ready to listen.");
};

const updateActionState = () => {
  const hasTranscript = Boolean(latestTranscript.trim());
  const supabaseClient = getSupabaseClient();
  analyzeButton.disabled = !hasTranscript || !supabaseClient;
};

const setupRecognition = () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setStatus("Speech recognition is not supported in this browser.");
    recordButton.disabled = true;
    return null;
  }

  const recognizer = new SpeechRecognition();
  recognizer.continuous = true;
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
    if (finalText.trim()) {
      transcriptBuffer = `${transcriptBuffer} ${finalText}`.trim();
    }
    pendingTranscript = transcriptBuffer.trim();
    transcriptEl.textContent = interim || transcriptBuffer;
  };

  recognizer.onerror = (event) => {
    setStatus(`Error: ${event.error}`);
    setRecordingState(false);
  };

  recognizer.onend = () => {
    if (isRecording) {
      recognizer.start();
      return;
    }
    setRecordingState(false);
    if (pendingTranscript) {
      latestTranscript = pendingTranscript;
      transcriptEl.textContent = latestTranscript;
      setStatus("Transcript ready. Analyze when you're ready.");
    }
    pendingTranscript = "";
    updateActionState();
  };

  return recognizer;
};

const handleToggle = () => {
  if (!recognition) {
    recognition = setupRecognition();
  }

  if (!recognition) return;

  if (isRecording) {
    isRecording = false;
    recognition.stop();
    return;
  }

  pendingTranscript = "";
  latestTranscript = "";
  transcriptBuffer = "";
  transcriptEl.textContent = "";
  setRecordingState(true);
  recognition.start();
};

const parseMuscles = (muscles) => {
  if (Array.isArray(muscles)) return muscles;
  if (typeof muscles === "string" && muscles.trim()) {
    try {
      const parsed = JSON.parse(muscles);
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      return muscles.split(",").map((item) => item.trim());
    }
  }
  return [];
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

  logs.forEach((log) => {
    const item = document.createElement("li");
    item.className = "log-item";

    const summary = document.createElement("div");
    summary.className = "log-text";
    summary.textContent = log.summary || log.raw_text;

    const raw = document.createElement("div");
    raw.className = "log-meta";
    raw.textContent = `Raw: ${log.raw_text}`;

    const meta = document.createElement("div");
    meta.className = "log-meta";
    const muscles = parseMuscles(log.muscles_hit);
    const muscleText = muscles.length ? muscles.join(", ") : "none";
    meta.textContent = `${new Date(
      log.created_at
    ).toLocaleString()} · Exertion ${log.exertion_score || 0} · Muscles ${muscleText} · Cardio ${
      log.cardio_detected ? "yes" : "no"
    }`;

    item.appendChild(summary);
    item.appendChild(raw);
    item.appendChild(meta);
    logList.appendChild(item);
  });
};

const normalizeMuscle = (name) => {
  const muscle = name.toLowerCase().trim();
  if (["biceps", "triceps", "forearms", "arms"].includes(muscle)) return "arms";
  if (["quads", "hamstrings", "calves", "glutes", "legs"].includes(muscle))
    return "legs";
  if (["abs", "obliques", "core"].includes(muscle)) return "core";
  if (["lats", "upper back", "lower back", "back"].includes(muscle))
    return "back";
  if (["delts", "shoulders"].includes(muscle)) return "shoulders";
  if (["pecs", "chest"].includes(muscle)) return "chest";
  return muscle;
};

const clearHeatmap = () => {
  ["chest", "back", "legs", "arms", "shoulders", "core"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("heat-active");
  });
};

const updateHeatmap = (logs) => {
  clearHeatmap();
  const recent = logs.slice(0, 10);
  const muscleSet = new Set();

  recent.forEach((log) => {
    const muscles = parseMuscles(log.muscles_hit);
    muscles.forEach((muscleName) => {
      muscleSet.add(normalizeMuscle(muscleName));
    });
  });

  muscleSet.forEach((muscle) => {
    const el = document.getElementById(muscle);
    if (!el) return;
    el.classList.add("heat-active");
  });
};

const fetchLogs = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    setStatus("Add Supabase credentials in supabaseClient.js to load logs.");
    renderLogs([]);
    updateHeatmap([]);
    return;
  }

  const { data, error } = await supabase
    .from("workouts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    setStatus("Failed to load logs from Supabase.");
    return;
  }

  currentLogs = data || [];
  renderLogs(currentLogs);
  updateHeatmap(currentLogs);
};

const parseJsonFromText = (text) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw error;
    return JSON.parse(match[0]);
  }
};

const analyzeWithGemini = async (text) => {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    let message = "Gemini request failed.";
    try {
      const errJson = await response.json();
      message = errJson.error || message;
    } catch (error) {
      const errText = await response.text();
      if (errText) message = errText;
    }
    throw new Error(message);
  }

  const json = await response.json();
  return json;
};

const saveWorkout = async (rawText, analysis) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Missing Supabase configuration.");

  const muscles = parseMuscles(analysis.muscles);
  const payload = {
    raw_text: rawText,
    summary: analysis.summary || rawText,
    muscles_hit: muscles,
    exertion_score: Number(analysis.exertion_score) || 0,
    cardio_detected: Boolean(analysis.cardio_detected),
  };

  const { error } = await supabase.from("workouts").insert(payload);
  if (error) throw error;
};

const handleAnalyze = async () => {
  if (!latestTranscript) return;
  analyzeButton.disabled = true;
  setStatus("Analyzing with Gemini...");
  try {
    const analysis = await analyzeWithGemini(latestTranscript);
    setStatus("Saving to Supabase...");
    await saveWorkout(latestTranscript, analysis);
    setStatus("Saved and analyzed.");
    latestTranscript = "";
    transcriptEl.textContent = "";
    await fetchLogs();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Failed to analyze or save.");
  } finally {
    updateActionState();
  }
};

const exportCsv = () => {
  if (!currentLogs.length) return;

  const header = [
    "created_at",
    "raw_text",
    "summary",
    "muscles_hit",
    "exertion_score",
    "cardio_detected",
  ];
  const rows = currentLogs.map((log) => [
    `"${log.created_at || ""}"`,
    `"${(log.raw_text || "").replace(/"/g, '""')}"`,
    `"${(log.summary || "").replace(/"/g, '""')}"`,
    `"${JSON.stringify(log.muscles_hit || []).replace(/"/g, '""')}"`,
    `"${log.exertion_score || 0}"`,
    `"${log.cardio_detected ? "true" : "false"}"`,
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

const openModal = () => {
  settingsModal.classList.remove("hidden");
  settingsModal.setAttribute("aria-hidden", "false");
};

const closeModal = () => {
  settingsModal.classList.add("hidden");
  settingsModal.setAttribute("aria-hidden", "true");
};

const populateSettings = () => {};

recordButton.addEventListener("click", handleToggle);
downloadCsv.addEventListener("click", exportCsv);
analyzeButton.addEventListener("click", handleAnalyze);
openSettings.addEventListener("click", () => {
  populateSettings();
  openModal();
});
closeSettings.addEventListener("click", closeModal);
settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) closeModal();
});

fetchLogs();
updateActionState();

