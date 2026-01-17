// Navigation
const navItems = document.querySelectorAll(".nav-item");
const screens = document.querySelectorAll(".screen");

const navigateTo = (screenId) => {
  screens.forEach((s) => s.classList.remove("active"));
  navItems.forEach((n) => n.classList.remove("active"));

  const screen = document.getElementById(`screen-${screenId}`);
  const navItem = document.querySelector(`[data-screen="${screenId}"]`);

  if (screen) screen.classList.add("active");
  if (navItem) navItem.classList.add("active");

  // Refresh data when navigating
  if (screenId === "logs") {
    fetchLogs();
  } else if (screenId === "recommendations") {
    loadRecommendation();
  } else if (screenId === "profile") {
    loadProfile();
    renderChart();
  }
};

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navigateTo(item.dataset.screen);
  });
});

// Home Screen - Recording
const recordButton = document.getElementById("recordButton");
const recordLabel = document.getElementById("recordLabel");
const timerEl = document.getElementById("timer");
const notesInput = document.getElementById("workoutNotes");
const saveLogBtn = document.getElementById("saveLogBtn");

let isRecording = false;
let startTime = null;
let timerInterval = null;
let recognition = null;

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const updateTimer = () => {
  if (!startTime) return;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  timerEl.textContent = formatTime(elapsed);
};

const startRecording = () => {
  isRecording = true;
  startTime = Date.now();
  recordButton.classList.add("is-recording");
  recordLabel.innerHTML = "STOP<br>RECORDING";
  timerInterval = setInterval(updateTimer, 1000);
  
  // Start speech recognition
  startSpeechRecognition();
};

const stopRecording = () => {
  isRecording = false;
  recordButton.classList.remove("is-recording");
  recordLabel.innerHTML = "START<br>RECORDING";
  clearInterval(timerInterval);
  
  // Stop speech recognition
  if (recognition) {
    recognition.stop();
  }
};

recordButton.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// Speech Recognition
const startSpeechRecognition = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let transcriptBuffer = "";

  recognition.onresult = (event) => {
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalText += event.results[i][0].transcript;
      }
    }
    if (finalText.trim()) {
      transcriptBuffer = `${transcriptBuffer} ${finalText}`.trim();
      notesInput.value = transcriptBuffer;
    }
  };

  recognition.onend = () => {
    if (isRecording) {
      recognition.start();
    }
  };

  recognition.start();
};

// Save Log
saveLogBtn.addEventListener("click", async () => {
  const notes = notesInput.value.trim();
  const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

  if (!notes && duration === 0) {
    alert("Please record a workout or add notes first.");
    return;
  }

  saveLogBtn.disabled = true;
  saveLogBtn.textContent = "Saving...";

  try {
    // Analyze with AI
    const analysis = await analyzeWorkout(notes || "General workout");

    // Save to Supabase
    const supabase = window.supabaseClient?.getClient();
    if (supabase) {
      const payload = {
        raw_text: notes || `${Math.floor(duration / 60)} min workout`,
        summary: analysis.summary || notes,
        muscles_hit: analysis.muscles || [],
        exertion_score: analysis.exertion_score || 5,
        cardio_detected: analysis.cardio_detected || false,
        duration_seconds: duration,
      };

      const { error } = await supabase.from("workouts").insert(payload);
      if (error) throw error;
    }

    // Reset
    stopRecording();
    notesInput.value = "";
    startTime = null;
    timerEl.textContent = "00:00";

    // Navigate to logs
    navigateTo("logs");
  } catch (error) {
    console.error(error);
    alert("Failed to save. Check console for details.");
  } finally {
    saveLogBtn.disabled = false;
    saveLogBtn.textContent = "SAVE LOG";
  }
});

// Analyze workout with AI
const analyzeWorkout = async (text) => {
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error("Analysis failed");
      return { muscles: [], exertion_score: 5, cardio_detected: false, summary: text };
    }

    return await response.json();
  } catch (error) {
    console.error(error);
    return { muscles: [], exertion_score: 5, cardio_detected: false, summary: text };
  }
};

// Logs Screen
const logList = document.getElementById("logList");
const insightText = document.getElementById("insightText");
let currentLogs = [];

const fetchLogs = async () => {
  const supabase = window.supabaseClient?.getClient();
  if (!supabase) {
    renderLogs([]);
    return;
  }

  try {
    const { data, error } = await supabase
      .from("workouts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    currentLogs = data || [];
    renderLogs(currentLogs);
    updateHeatmap(currentLogs);
    updateInsight(currentLogs);
  } catch (error) {
    console.error(error);
    renderLogs([]);
  }
};

const renderLogs = (logs) => {
  logList.innerHTML = "";

  if (logs.length === 0) {
    logList.innerHTML = '<li class="log-empty">No workouts logged yet. Start recording!</li>';
    return;
  }

  logs.slice(0, 10).forEach((log) => {
    const item = document.createElement("li");
    item.className = "log-item";

    const date = new Date(log.created_at);
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    const muscles = Array.isArray(log.muscles_hit) ? log.muscles_hit : [];
    const muscleStr = muscles.length > 0 ? muscles.slice(0, 3).join(" & ") : "Workout";

    item.innerHTML = `
      <div class="log-item-content">
        <h3>${dayName}: ${muscleStr}</h3>
        <p>${dateStr}, ${timeStr}</p>
      </div>
      <span class="log-item-arrow">›</span>
    `;

    logList.appendChild(item);
  });
};

// Heatmap
const muscleMapping = {
  chest: ["chest"],
  back: ["back-upper", "back-lower"],
  shoulders: ["shoulders-left-front", "shoulders-right-front", "shoulders-left-back", "shoulders-right-back"],
  arms: ["arms-left-upper", "arms-right-upper", "arms-left-lower", "arms-right-lower", "triceps-left", "triceps-right", "forearms-left", "forearms-right"],
  biceps: ["arms-left-upper", "arms-right-upper"],
  triceps: ["triceps-left", "triceps-right"],
  core: ["core"],
  abs: ["core"],
  legs: ["legs-left-upper", "legs-right-upper", "legs-left-lower", "legs-right-lower", "hamstrings-left", "hamstrings-right", "calves-left", "calves-right"],
  quads: ["legs-left-upper", "legs-right-upper"],
  hamstrings: ["hamstrings-left", "hamstrings-right"],
  glutes: ["glutes-left", "glutes-right"],
  calves: ["calves-left", "calves-right", "legs-left-lower", "legs-right-lower"],
};

const clearHeatmap = () => {
  document.querySelectorAll(".muscle-part").forEach((el) => {
    el.classList.remove("heat-low", "heat-medium", "heat-high");
  });
};

const updateHeatmap = (logs) => {
  clearHeatmap();

  const muscleCount = {};
  const recent = logs.slice(0, 10);

  recent.forEach((log, index) => {
    const muscles = Array.isArray(log.muscles_hit) ? log.muscles_hit : [];
    const weight = 10 - index; // More recent = more weight

    muscles.forEach((muscle) => {
      const key = muscle.toLowerCase().trim();
      muscleCount[key] = (muscleCount[key] || 0) + weight;
    });
  });

  Object.entries(muscleCount).forEach(([muscle, count]) => {
    const svgIds = muscleMapping[muscle] || [];
    let heatClass = "heat-low";
    if (count >= 20) heatClass = "heat-high";
    else if (count >= 10) heatClass = "heat-medium";

    svgIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add(heatClass);
    });
  });
};

const updateInsight = (logs) => {
  if (logs.length === 0) {
    insightText.textContent = "Start logging workouts to see insights!";
    return;
  }

  const thisWeek = logs.filter((log) => {
    const logDate = new Date(log.created_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return logDate >= weekAgo;
  });

  if (thisWeek.length >= 4) {
    insightText.textContent = "You worked out consistently this week. Good job!";
  } else if (thisWeek.length >= 2) {
    insightText.textContent = `${thisWeek.length} workouts this week. Keep pushing!`;
  } else if (thisWeek.length === 1) {
    insightText.textContent = "1 workout this week. Let's get moving!";
  } else {
    insightText.textContent = "No workouts this week yet. Time to start!";
  }
};

// Recommendations Screen
const recommendationTitle = document.getElementById("recommendationTitle");
const changeWorkoutBtn = document.getElementById("changeWorkoutBtn");
const whyBtn = document.getElementById("whyBtn");
const explanationBox = document.getElementById("explanationBox");
const explanationText = document.getElementById("explanationText");

const workoutTypes = [
  { name: "Full Body Strength", muscles: ["chest", "back", "legs", "core"] },
  { name: "Upper Body Push", muscles: ["chest", "shoulders", "triceps"] },
  { name: "Upper Body Pull", muscles: ["back", "biceps"] },
  { name: "Leg Day", muscles: ["quads", "hamstrings", "glutes", "calves"] },
  { name: "Core & Cardio", muscles: ["core"], cardio: true },
  { name: "Active Recovery", muscles: [], light: true },
  { name: "HIIT Session", muscles: ["legs", "core"], cardio: true },
];

let currentRecommendation = null;

const loadRecommendation = async () => {
  try {
    const response = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs: currentLogs.slice(0, 5) }),
    });

    if (response.ok) {
      const data = await response.json();
      currentRecommendation = data;
      recommendationTitle.textContent = data.workout || "Full Body Strength";
      explanationText.textContent = data.reason || "Based on your recent activity.";
    } else {
      fallbackRecommendation();
    }
  } catch (error) {
    fallbackRecommendation();
  }
};

const fallbackRecommendation = () => {
  const recent = currentLogs.slice(0, 3);
  const recentMuscles = new Set();

  recent.forEach((log) => {
    (log.muscles_hit || []).forEach((m) => recentMuscles.add(m.toLowerCase()));
  });

  // Find a workout that targets different muscles
  let bestWorkout = workoutTypes[0];
  let bestScore = -1;

  workoutTypes.forEach((workout) => {
    let score = 0;
    workout.muscles.forEach((m) => {
      if (!recentMuscles.has(m)) score += 2;
    });
    if (score > bestScore) {
      bestScore = score;
      bestWorkout = workout;
    }
  });

  currentRecommendation = {
    workout: bestWorkout.name,
    reason: `Based on your recent workouts, we suggest focusing on ${bestWorkout.muscles.join(", ") || "recovery"} today.`,
  };

  recommendationTitle.textContent = currentRecommendation.workout;
  explanationText.textContent = currentRecommendation.reason;
};

changeWorkoutBtn.addEventListener("click", () => {
  const current = recommendationTitle.textContent;
  const others = workoutTypes.filter((w) => w.name !== current);
  const random = others[Math.floor(Math.random() * others.length)];

  currentRecommendation = {
    workout: random.name,
    reason: `Alternative suggestion: ${random.name} targets ${random.muscles.join(", ") || "overall fitness"}.`,
  };

  recommendationTitle.textContent = currentRecommendation.workout;
  explanationText.textContent = currentRecommendation.reason;
});

whyBtn.addEventListener("click", () => {
  explanationBox.classList.toggle("hidden");
});

// Profile Screen
const weightInput = document.getElementById("weightInput");
const heightInput = document.getElementById("heightInput");
const calculateBmiBtn = document.getElementById("calculateBmiBtn");
const bmiResult = document.getElementById("bmiResult");
const bmiValue = document.getElementById("bmiValue");

const PROFILE_KEY = "workoutTrackerProfile";

const loadProfile = () => {
  const saved = localStorage.getItem(PROFILE_KEY);
  if (saved) {
    try {
      const profile = JSON.parse(saved);
      weightInput.value = profile.weight || "";
      heightInput.value = profile.height || "";
      if (profile.bmi) {
        showBmi(profile.bmi);
      }
    } catch (e) {
      console.error(e);
    }
  }
};

const saveProfile = (weight, height, bmi) => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ weight, height, bmi }));
};

const getBmiCategory = (bmi) => {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal Weight";
  if (bmi < 30) return "Overweight";
  return "Obese";
};

const showBmi = (bmi) => {
  bmiResult.classList.remove("hidden");
  bmiValue.textContent = `${bmi.toFixed(1)} (${getBmiCategory(bmi)})`;
};

calculateBmiBtn.addEventListener("click", () => {
  const weight = parseFloat(weightInput.value);
  const height = parseFloat(heightInput.value);

  if (!weight || !height || weight <= 0 || height <= 0) {
    alert("Please enter valid weight and height.");
    return;
  }

  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);

  showBmi(bmi);
  saveProfile(weight, height, bmi);
});

// Weekly Chart (simple canvas-based)
const renderChart = () => {
  const canvas = document.getElementById("weeklyChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const container = canvas.parentElement;

  // Set canvas size
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const width = canvas.width;
  const height = canvas.height;

  // Get weekly data
  const weeklyData = getWeeklyWorkoutCounts();

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Draw
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / weeklyData.length - 10;
  const maxVal = Math.max(...weeklyData.map((d) => d.count), 5);

  // Y-axis labels
  ctx.fillStyle = "#86868b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = padding + chartHeight - (i / 4) * chartHeight;
    const val = Math.round((i / 4) * maxVal);
    ctx.fillText(val.toString(), padding - 8, y + 4);
  }

  // Bars
  weeklyData.forEach((data, i) => {
    const barHeight = (data.count / maxVal) * chartHeight;
    const x = padding + i * (chartWidth / weeklyData.length) + 5;
    const y = padding + chartHeight - barHeight;

    // Bar gradient
    const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
    gradient.addColorStop(0, "#6b9ee4");
    gradient.addColorStop(1, "#4a7cc9");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 4);
    ctx.fill();

    // Label
    ctx.fillStyle = "#86868b";
    ctx.textAlign = "center";
    ctx.fillText(data.label, x + barWidth / 2, height - 10);
  });
};

const getWeeklyWorkoutCounts = () => {
  const weeks = [];
  const now = new Date();

  for (let i = 4; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const count = currentLogs.filter((log) => {
      const logDate = new Date(log.created_at);
      return logDate >= weekStart && logDate < weekEnd;
    }).length;

    weeks.push({
      label: `W${5 - i}`,
      count,
    });
  }

  return weeks;
};

// Initialize
fetchLogs();
loadProfile();
