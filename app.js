// ============================================
// State Management
// ============================================
let currentLogs = [];
let muscleHeatmapCache = {};
let weeklySummaryCache = { total: 0, cardio: 0, flexibility: 0, strength: 0 };
let weightHistory = [];
let currentChartType = "weight";
let isRecording = false;
let startTime = null;
let timerInterval = null;
let recognition = null;
let selectedIntensity = 3;

// User State for Recommendations
const userState = {
  energyLevel: 50,
  restLevel: 50,
};

// ============================================
// Navigation
// ============================================
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

// ============================================
// Home Screen - Recording
// ============================================
const recordButton = document.getElementById("recordButton");
const recordLabel = document.getElementById("recordLabel");
const timerEl = document.getElementById("timer");
const notesInput = document.getElementById("workoutNotes");
const saveLogBtn = document.getElementById("saveLogBtn");

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
  startSpeechRecognition();
};

const stopRecording = () => {
  isRecording = false;
  recordButton.classList.remove("is-recording");
  recordLabel.innerHTML = "START<br>RECORDING";
  clearInterval(timerInterval);
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

// Intensity Selector
const intensitySelector = document.getElementById("intensitySelector");
const intensityBtns = intensitySelector?.querySelectorAll(".intensity-btn");

intensityBtns?.forEach((btn) => {
  btn.addEventListener("click", () => {
    intensityBtns.forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedIntensity = parseInt(btn.dataset.value, 10);
  });
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
    // Analyze with AI to extract tags
    const analysis = await analyzeWorkout(notes || "General workout");

    // Save to Supabase
    const supabase = window.supabaseClient?.getClient();
    if (supabase) {
      // Insert workout session with user-selected intensity
      const sessionPayload = {
        raw_text: notes || `${Math.floor(duration / 60)} min workout`,
        summary: analysis.summary || notes,
        muscles_hit: analysis.muscles || [],
        exertion_score: analysis.exertion_score || 5,
        intensity_score: selectedIntensity, // User-selected 1-5 intensity
        cardio_detected: analysis.cardio_detected || false,
        flexibility_detected: analysis.flexibility_detected || false,
        duration_seconds: duration,
      };

      const { data: session, error } = await supabase
        .from("workouts")
        .insert(sessionPayload)
        .select()
        .single();

      if (error) throw error;

      // Update caches asynchronously
      updateCaches(session);
    }

    // Reset UI
    stopRecording();
    notesInput.value = "";
    startTime = null;
    timerEl.textContent = "00:00";
    
    // Reset intensity selector
    selectedIntensity = 3;
    intensityBtns?.forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.value === "3");
    });

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
      return { muscles: [], exertion_score: 5, cardio_detected: false, flexibility_detected: false, summary: text };
    }

    return await response.json();
  } catch (error) {
    console.error(error);
    return { muscles: [], exertion_score: 5, cardio_detected: false, flexibility_detected: false, summary: text };
  }
};

// Update caches after saving
const updateCaches = async (session) => {
  try {
    await fetch("/api/update-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    });
  } catch (error) {
    console.error("Cache update failed:", error);
  }
};

// ============================================
// Logs Screen
// ============================================
const logList = document.getElementById("logList");
const insightText = document.getElementById("insightText");
const strengthCount = document.getElementById("strengthCount");
const cardioCount = document.getElementById("cardioCount");
const flexibilityCount = document.getElementById("flexibilityCount");

const fetchLogs = async () => {
  const supabase = window.supabaseClient?.getClient();
  if (!supabase) {
    renderLogs([]);
    return;
  }

  try {
    // Fetch recent sessions
    const { data, error } = await supabase
      .from("workouts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    currentLogs = data || [];
    renderLogs(currentLogs);
    
    // Load or compute heatmap cache
    await loadHeatmapCache();
    updateHeatmapFromCache();
    
    // Compute weekly summary
    computeWeeklySummary();
    updateInsight();
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

  logs.slice(0, 5).forEach((log) => {
    const item = document.createElement("li");
    item.className = "log-item";

    const date = new Date(log.created_at);
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    const muscles = Array.isArray(log.muscles_hit) ? log.muscles_hit : [];
    const muscleStr = muscles.length > 0 ? muscles.slice(0, 3).join(" & ") : "Workout";

    // Build tags
    let tagsHtml = "";
    if (log.cardio_detected) {
      tagsHtml += '<span class="log-tag" title="Cardio">❤️</span>';
    }
    if (log.flexibility_detected) {
      tagsHtml += '<span class="log-tag" title="Flexibility">🧘</span>';
    }

    item.innerHTML = `
      <div class="log-item-content">
        <h3>
          ${dayName}: ${muscleStr}
          <span class="log-tags">${tagsHtml}</span>
        </h3>
        <p>${dateStr}, ${timeStr}</p>
      </div>
      <span class="log-item-arrow">›</span>
    `;

    logList.appendChild(item);
  });
};

// ============================================
// Heatmap
// ============================================
const loadHeatmapCache = async () => {
  try {
    const response = await fetch("/api/heatmap-cache");
    if (response.ok) {
      muscleHeatmapCache = await response.json();
    } else {
      // Compute locally if cache endpoint not available
      computeHeatmapLocally();
    }
  } catch (error) {
    computeHeatmapLocally();
  }
};

const computeHeatmapLocally = () => {
  const muscleScores = {};
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  currentLogs.forEach((log) => {
    const logDate = new Date(log.created_at);
    if (logDate < thirtyDaysAgo) return;

    const daysSince = (now - logDate) / (1000 * 60 * 60 * 24);
    const weight = Math.max(0, 1 - daysSince / 30); // Decay over 30 days

    const muscles = Array.isArray(log.muscles_hit) ? log.muscles_hit : [];
    muscles.forEach((muscle) => {
      const key = muscle.toLowerCase().trim();
      muscleScores[key] = Math.min(1, (muscleScores[key] || 0) + weight * 0.3);
    });
  });

  muscleHeatmapCache = muscleScores;
};

const updateHeatmapFromCache = () => {
  // Clear all heat attributes
  document.querySelectorAll(".muscle-part").forEach((el) => {
    el.removeAttribute("data-heat");
    el.style.fill = "";
  });

  // Apply heat based on cache
  Object.entries(muscleHeatmapCache).forEach(([muscle, score]) => {
    const elements = document.querySelectorAll(`[data-muscle="${muscle}"]`);
    
    // Map score to heat level
    let heatLevel = "0";
    if (score >= 0.8) heatLevel = "1.0";
    else if (score >= 0.6) heatLevel = "0.8";
    else if (score >= 0.4) heatLevel = "0.6";
    else if (score >= 0.2) heatLevel = "0.4";
    else if (score > 0) heatLevel = "0.2";

    elements.forEach((el) => {
      if (heatLevel !== "0") {
        el.setAttribute("data-heat", heatLevel);
      }
    });
  });

  // Also handle muscle group aliases
  const aliases = {
    chest: ["chest"],
    back: ["back"],
    shoulders: ["shoulders"],
    biceps: ["biceps"],
    triceps: ["triceps"],
    forearms: ["forearms"],
    core: ["core", "abs"],
    quads: ["quads", "legs"],
    hamstrings: ["hamstrings"],
    glutes: ["glutes"],
    calves: ["calves"],
  };

  Object.entries(aliases).forEach(([target, sources]) => {
    sources.forEach((source) => {
      if (muscleHeatmapCache[source] && source !== target) {
        const elements = document.querySelectorAll(`[data-muscle="${target}"]`);
        const score = muscleHeatmapCache[source];
        let heatLevel = "0";
        if (score >= 0.8) heatLevel = "1.0";
        else if (score >= 0.6) heatLevel = "0.8";
        else if (score >= 0.4) heatLevel = "0.6";
        else if (score >= 0.2) heatLevel = "0.4";
        else if (score > 0) heatLevel = "0.2";

        elements.forEach((el) => {
          if (heatLevel !== "0" && !el.getAttribute("data-heat")) {
            el.setAttribute("data-heat", heatLevel);
          }
        });
      }
    });
  });
};

// ============================================
// Weekly Summary
// ============================================
const computeWeeklySummary = () => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  let total = 0;
  let cardio = 0;
  let flexibility = 0;

  currentLogs.forEach((log) => {
    const logDate = new Date(log.created_at);
    if (logDate >= weekStart) {
      total++;
      if (log.cardio_detected) cardio++;
      if (log.flexibility_detected) flexibility++;
    }
  });

  weeklySummaryCache = {
    total,
    cardio,
    flexibility,
    strength: total - cardio - flexibility,
  };

  // Update UI
  strengthCount.textContent = Math.max(0, weeklySummaryCache.strength);
  cardioCount.textContent = weeklySummaryCache.cardio;
  flexibilityCount.textContent = weeklySummaryCache.flexibility;
};

const updateInsight = () => {
  const { total, cardio, flexibility, strength } = weeklySummaryCache;

  if (total === 0) {
    insightText.textContent = "No workouts this week yet. Time to start!";
    return;
  }

  if (total >= 5) {
    insightText.textContent = "You worked out consistently this week. Good job!";
  } else if (total >= 3) {
    insightText.textContent = `${total} workouts this week. Keep up the momentum!`;
  } else if (total >= 1) {
    insightText.textContent = `${total} workout${total > 1 ? "s" : ""} this week. Let's add more!`;
  }

  // Add balance suggestions
  if (cardio === 0 && total >= 2) {
    insightText.textContent += " Consider adding some cardio.";
  } else if (flexibility === 0 && total >= 3) {
    insightText.textContent += " Don't forget flexibility work!";
  }
};

// ============================================
// Recommendations Screen
// ============================================
const recommendationTitle = document.getElementById("recommendationTitle");
const changeWorkoutBtn = document.getElementById("changeWorkoutBtn");
const whyBtn = document.getElementById("whyBtn");
const explanationBox = document.getElementById("explanationBox");
const explanationText = document.getElementById("explanationText");
const energySlider = document.getElementById("energySlider");
const restSlider = document.getElementById("restSlider");
const energyValue = document.getElementById("energyValue");
const restValue = document.getElementById("restValue");
const tellMeMoreBtn = document.getElementById("tellMeMoreBtn");
const detailContent = document.getElementById("detailContent");
const adviceText = document.getElementById("adviceText");
const exerciseList = document.getElementById("exerciseList");

const workoutTypes = [
  { 
    name: "Full Body Strength", 
    muscles: ["chest", "back", "legs", "core"], 
    type: "strength",
    category: "strength",
    exercises: ["Squats", "Deadlifts", "Bench Press", "Rows", "Planks"]
  },
  { 
    name: "Upper Body Push", 
    muscles: ["chest", "shoulders", "triceps"], 
    type: "strength",
    category: "push",
    exercises: ["Bench Press", "Overhead Press", "Dips", "Lateral Raises", "Tricep Extensions"]
  },
  { 
    name: "Upper Body Pull", 
    muscles: ["back", "biceps"], 
    type: "strength",
    category: "pull",
    exercises: ["Pull-ups", "Barbell Rows", "Face Pulls", "Bicep Curls", "Lat Pulldowns"]
  },
  { 
    name: "Leg Day", 
    muscles: ["quads", "hamstrings", "glutes", "calves"], 
    type: "strength",
    category: "legs",
    exercises: ["Squats", "Romanian Deadlifts", "Leg Press", "Lunges", "Calf Raises"]
  },
  { 
    name: "Core & Cardio", 
    muscles: ["core"], 
    cardio: true, 
    type: "cardio",
    category: "cardio",
    exercises: ["Running", "Burpees", "Mountain Climbers", "Bicycle Crunches", "Jump Rope"]
  },
  { 
    name: "Active Recovery / Yoga", 
    muscles: [], 
    type: "flexibility",
    category: "recovery",
    exercises: ["Sun Salutations", "Cat-Cow Stretch", "Pigeon Pose", "Child's Pose", "Foam Rolling"]
  },
  { 
    name: "HIIT Session", 
    muscles: ["legs", "core"], 
    cardio: true, 
    type: "cardio",
    category: "hiit",
    exercises: ["Sprint Intervals", "Box Jumps", "Kettlebell Swings", "Battle Ropes", "Burpees"]
  },
  { 
    name: "Hypertrophy / Strength", 
    muscles: ["chest", "back", "shoulders"], 
    type: "strength",
    category: "hypertrophy",
    exercises: ["Heavy Squats", "Bench Press 5x5", "Barbell Rows", "Overhead Press", "Deadlifts"]
  },
];

let currentRecommendation = null;

// Energy/Rest Slider Handlers
energySlider?.addEventListener("input", (e) => {
  userState.energyLevel = parseInt(e.target.value, 10);
  if (energyValue) energyValue.textContent = userState.energyLevel;
  updateRecommendationFromState();
});

restSlider?.addEventListener("input", (e) => {
  userState.restLevel = parseInt(e.target.value, 10);
  if (restValue) restValue.textContent = userState.restLevel;
  updateRecommendationFromState();
});

// Smart Recommendation Engine
const getRecommendedWorkout = (energy, rest, history) => {
  // Rule-based recommendation logic
  if (energy < 30 && rest < 30) {
    return workoutTypes.find((w) => w.name === "Active Recovery / Yoga");
  }
  
  if (rest > 70 && energy > 60) {
    return workoutTypes.find((w) => w.name === "Hypertrophy / Strength");
  }
  
  if (energy > 70 && rest > 50) {
    return workoutTypes.find((w) => w.name === "HIIT Session");
  }
  
  if (rest < 40) {
    return workoutTypes.find((w) => w.type === "flexibility");
  }
  
  if (energy < 50) {
    return workoutTypes.find((w) => w.name === "Core & Cardio");
  }

  // Balance based on history
  const recentMuscles = new Set();
  let recentCardio = 0;
  let recentFlex = 0;

  history.slice(0, 7).forEach((log) => {
    (log.muscles_hit || []).forEach((m) => recentMuscles.add(m.toLowerCase()));
    if (log.cardio_detected) recentCardio++;
    if (log.flexibility_detected) recentFlex++;
  });

  // Find best workout based on balance
  let bestWorkout = workoutTypes[0];
  let bestScore = -1;

  workoutTypes.forEach((workout) => {
    let score = 0;

    // Prefer muscles not recently worked
    workout.muscles.forEach((m) => {
      if (!recentMuscles.has(m)) score += 2;
    });

    // Balance cardio/flexibility
    if (workout.type === "cardio" && recentCardio < 2) score += 3;
    if (workout.type === "flexibility" && recentFlex < 1) score += 3;

    // Adjust by energy/rest
    if (workout.type === "strength" && rest > 50) score += 2;
    if (workout.type === "cardio" && energy > 50) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestWorkout = workout;
    }
  });

  return bestWorkout;
};

const updateRecommendationFromState = () => {
  const recommended = getRecommendedWorkout(
    userState.energyLevel,
    userState.restLevel,
    currentLogs
  );

  if (!recommended) return;

  let reason = "";
  if (userState.energyLevel < 30 && userState.restLevel < 30) {
    reason = "You're low on energy and need rest. Light recovery is best today.";
  } else if (userState.restLevel > 70 && userState.energyLevel > 60) {
    reason = "You're well-rested and energized! Time to push hard with strength training.";
  } else if (userState.energyLevel > 70) {
    reason = "High energy detected! Channel it into an intense workout.";
  } else if (userState.restLevel < 40) {
    reason = "Your body needs recovery. Focus on mobility and stretching.";
  } else {
    reason = "Based on your current state and workout history.";
  }

  currentRecommendation = {
    workout: recommended.name,
    reason,
    category: recommended.category,
    exercises: recommended.exercises,
  };

  recommendationTitle.textContent = currentRecommendation.workout;
  explanationText.textContent = currentRecommendation.reason;
  
  // Update Tell Me More content
  updateWorkoutDetail(recommended);
};

const loadRecommendation = async () => {
  // First, use state-based recommendation
  updateRecommendationFromState();
  
  // Then try AI recommendation as enhancement
  try {
    const response = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        logs: currentLogs.slice(0, 7),
        energy: userState.energyLevel,
        rest: userState.restLevel,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      // Only update if AI gives a valid response
      if (data.workout) {
        currentRecommendation = {
          ...currentRecommendation,
          workout: data.workout,
          reason: data.reason || currentRecommendation.reason,
        };
        recommendationTitle.textContent = data.workout;
        if (data.reason) {
          explanationText.textContent = data.reason;
        }
      }
    }
  } catch (error) {
    // State-based recommendation already set, just log error
    console.error("AI recommendation failed, using local:", error);
  }
};

changeWorkoutBtn.addEventListener("click", () => {
  const current = recommendationTitle.textContent;
  const others = workoutTypes.filter((w) => w.name !== current);
  const random = others[Math.floor(Math.random() * others.length)];

  currentRecommendation = {
    workout: random.name,
    reason: `Alternative: ${random.name} focuses on ${random.muscles.length > 0 ? random.muscles.join(", ") : random.type}.`,
    category: random.category,
    exercises: random.exercises,
  };

  recommendationTitle.textContent = currentRecommendation.workout;
  explanationText.textContent = currentRecommendation.reason;
  updateWorkoutDetail(random);
});

whyBtn.addEventListener("click", () => {
  explanationBox.classList.toggle("hidden");
});

// ============================================
// Tell Me More Component
// ============================================
tellMeMoreBtn?.addEventListener("click", () => {
  tellMeMoreBtn.classList.toggle("open");
  detailContent?.classList.toggle("hidden");
});

const updateWorkoutDetail = async (workout) => {
  if (!workout) return;

  // Get last session for this category
  const lastSession = await getLastSessionForCategory(workout.category);
  
  // Generate dynamic advice
  let advice = "";
  if (lastSession) {
    const lastIntensity = lastSession.intensity_score || lastSession.exertion_score || 3;
    
    if (lastIntensity >= 4) {
      advice = "Last time was a grinder! 💪 Dial it back today and focus on form. Your muscles need time to adapt.";
    } else if (lastIntensity <= 2) {
      advice = "You crushed it easily last time! 🚀 Push harder today - add weight or reps to keep progressing.";
    } else {
      advice = "Your last session was moderate. Maintain the intensity or slightly increase the challenge.";
    }
    
    // Add time-based context
    const daysSince = Math.floor((Date.now() - new Date(lastSession.created_at)) / (1000 * 60 * 60 * 24));
    if (daysSince > 7) {
      advice += ` It's been ${daysSince} days since you trained this - ease back in.`;
    } else if (daysSince < 2) {
      advice += " You trained this recently - consider recovery if feeling sore.";
    }
  } else {
    advice = "No recent history for this workout type. Start with moderate intensity and focus on proper form.";
  }

  if (adviceText) adviceText.textContent = advice;

  // Render exercise list
  if (exerciseList && workout.exercises) {
    exerciseList.innerHTML = workout.exercises
      .map((ex) => `<li>${ex}</li>`)
      .join("");
  }
};

const getLastSessionForCategory = async (category) => {
  if (!category || currentLogs.length === 0) return null;

  // Map category to muscle groups
  const categoryMuscles = {
    push: ["chest", "shoulders", "triceps"],
    pull: ["back", "biceps"],
    legs: ["quads", "hamstrings", "glutes", "calves"],
    strength: ["chest", "back", "legs"],
    cardio: [],
    recovery: [],
    hiit: ["legs", "core"],
    hypertrophy: ["chest", "back", "shoulders"],
  };

  const targetMuscles = categoryMuscles[category] || [];

  // Find last session matching the category
  for (const log of currentLogs) {
    const logMuscles = (log.muscles_hit || []).map((m) => m.toLowerCase());
    
    if (category === "cardio" && log.cardio_detected) {
      return log;
    }
    if (category === "recovery" && log.flexibility_detected) {
      return log;
    }
    if (targetMuscles.some((m) => logMuscles.includes(m))) {
      return log;
    }
  }

  return null;
};

// ============================================
// Profile Screen
// ============================================
const weightInput = document.getElementById("weightInput");
const heightInput = document.getElementById("heightInput");
const calculateBmiBtn = document.getElementById("calculateBmiBtn");
const bmiResult = document.getElementById("bmiResult");
const bmiValue = document.getElementById("bmiValue");
const chartToggleBtns = document.querySelectorAll(".chart-toggle-btn");

const PROFILE_KEY = "workoutTrackerProfile";
const WEIGHT_HISTORY_KEY = "workoutTrackerWeightHistory";

const loadProfile = () => {
  // Load from localStorage
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

  // Load weight history
  const historyStr = localStorage.getItem(WEIGHT_HISTORY_KEY);
  if (historyStr) {
    try {
      weightHistory = JSON.parse(historyStr);
    } catch (e) {
      weightHistory = [];
    }
  }
};

const saveProfile = (weight, height, bmi) => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ weight, height, bmi }));

  // Also add to weight history
  const today = new Date().toISOString().split("T")[0];
  const existing = weightHistory.find((e) => e.date === today);
  if (existing) {
    existing.weight = weight;
  } else {
    weightHistory.push({ date: today, weight });
  }

  // Keep last 30 entries
  if (weightHistory.length > 30) {
    weightHistory = weightHistory.slice(-30);
  }

  localStorage.setItem(WEIGHT_HISTORY_KEY, JSON.stringify(weightHistory));
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
  renderChart();
});

// Chart toggle
chartToggleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    chartToggleBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentChartType = btn.dataset.chart;
    renderChart();
  });
});

// ============================================
// Weekly Chart
// ============================================
const renderChart = () => {
  const canvas = document.getElementById("weeklyChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const container = canvas.parentElement;

  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  canvas.width = container.clientWidth * dpr;
  canvas.height = container.clientHeight * dpr;
  ctx.scale(dpr, dpr);

  const width = container.clientWidth;
  const height = container.clientHeight;

  // Get data based on chart type
  const chartData = currentChartType === "weight" 
    ? getWeightChartData() 
    : getSessionsChartData();

  // Clear
  ctx.clearRect(0, 0, width, height);

  if (chartData.length === 0) {
    ctx.fillStyle = "#86868b";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data yet", width / 2, height / 2);
    return;
  }

  // Draw chart
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = chartData.map((d) => d.value);
  const minVal = Math.min(...values) * 0.95;
  const maxVal = Math.max(...values) * 1.05;
  const range = maxVal - minVal || 1;

  // Y-axis labels
  ctx.fillStyle = "#86868b";
  ctx.font = "11px -apple-system, sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = minVal + (i / 4) * range;
    const y = padding.top + chartHeight - (i / 4) * chartHeight;
    ctx.fillText(val.toFixed(1), padding.left - 8, y + 4);
  }

  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = "#a0a0a0";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";

  chartData.forEach((point, i) => {
    const x = padding.left + (i / (chartData.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - ((point.value - minVal) / range) * chartHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // Draw dots
  chartData.forEach((point, i) => {
    const x = padding.left + (i / (chartData.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - ((point.value - minVal) / range) * chartHeight;

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#a0a0a0";
    ctx.fill();
  });

  // X-axis labels
  ctx.fillStyle = "#86868b";
  ctx.textAlign = "center";
  ctx.font = "10px -apple-system, sans-serif";
  chartData.forEach((point, i) => {
    const x = padding.left + (i / (chartData.length - 1 || 1)) * chartWidth;
    ctx.fillText(point.label, x, height - 10);
  });
};

const getWeightChartData = () => {
  if (weightHistory.length === 0) return [];

  // Get last 7 entries
  const recent = weightHistory.slice(-7);
  return recent.map((entry) => ({
    label: new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: entry.weight,
  }));
};

const getSessionsChartData = () => {
  const weeks = [];
  const now = new Date();

  for (let i = 4; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - i * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const count = currentLogs.filter((log) => {
      const logDate = new Date(log.created_at);
      return logDate >= weekStart && logDate < weekEnd;
    }).length;

    weeks.push({
      label: `W${5 - i}`,
      value: count,
    });
  }

  return weeks;
};

// Handle window resize for chart
window.addEventListener("resize", () => {
  if (document.getElementById("screen-profile").classList.contains("active")) {
    renderChart();
  }
});

// ============================================
// Initialize
// ============================================
fetchLogs();
loadProfile();
