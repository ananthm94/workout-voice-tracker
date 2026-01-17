const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname)));

// In-memory cache (in production, use Redis or database)
let muscleHeatmapCache = {};
let lastCacheUpdate = null;

const parseJsonFromText = (text) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw error;
    return JSON.parse(match[0]);
  }
};

// ============================================
// Analyze Workout (Extract Tags)
// ============================================
app.post("/api/analyze", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
    }
    const { text } = req.body || {};
    if (!text) {
      return res.status(400).json({ error: "Missing text." });
    }

    const systemPrompt = `You are a fitness data extractor. Analyze the user's workout notes and extract structured data.

Extract the following JSON:
{
  "muscles": ["list of specific muscle groups worked, e.g., chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, core"],
  "exertion_score": 1-10 (intensity level),
  "cardio_detected": boolean (true if cardio/running/cycling/HIIT mentioned),
  "flexibility_detected": boolean (true if stretching/yoga/mobility mentioned),
  "summary": "brief 1-sentence summary"
}

Return ONLY raw JSON, no markdown.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: systemPrompt },
                { text: `Workout notes: "${text}"` },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({
        error: err || "Gemini request failed.",
      });
    }

    const json = await response.json();
    const content =
      json.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") ||
      "";
    const parsed = parseJsonFromText(content);
    return res.json(parsed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error." });
  }
});

// ============================================
// AI Workout Recommendation
// ============================================
app.post("/api/recommend", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
    }

    const { logs } = req.body || {};
    const recentWorkouts = (logs || []).slice(0, 7).map((log) => ({
      muscles: log.muscles_hit || [],
      cardio: log.cardio_detected || false,
      flexibility: log.flexibility_detected || false,
      date: log.created_at,
    }));

    const systemPrompt = `You are a fitness coach AI. Based on the user's recent workout history (last 7 days), suggest the best workout for today.

Consider:
1. Muscle recovery - don't work the same muscles 2 days in a row
2. Balance - alternate between push/pull/legs
3. Variety - include cardio if missing, flexibility if neglected
4. Progressive overload - suggest intensity adjustments

Recent workouts (most recent first):
${JSON.stringify(recentWorkouts, null, 2)}

Return ONLY a JSON object:
{
  "workout": "Name of suggested workout (e.g., 'Upper Body Push', 'Leg Day', 'Full Body Strength', 'Active Recovery & Stretch', 'Core & Cardio', 'HIIT Session')",
  "reason": "1-2 sentence explanation based on their history"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          generationConfig: { temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err || "Gemini request failed." });
    }

    const json = await response.json();
    const content =
      json.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") ||
      "";
    const parsed = parseJsonFromText(content);
    return res.json(parsed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error." });
  }
});

// ============================================
// Heatmap Cache
// ============================================
app.get("/api/heatmap-cache", (req, res) => {
  res.json(muscleHeatmapCache);
});

app.post("/api/update-cache", (req, res) => {
  try {
    const { session } = req.body || {};
    if (!session) {
      return res.status(400).json({ error: "Missing session data." });
    }

    // Update muscle heatmap cache
    const muscles = session.muscles_hit || [];
    muscles.forEach((muscle) => {
      const key = muscle.toLowerCase().trim();
      // Add 0.3 for each new workout, decay will happen on read
      muscleHeatmapCache[key] = Math.min(1, (muscleHeatmapCache[key] || 0) + 0.3);
    });

    lastCacheUpdate = new Date().toISOString();

    return res.json({ success: true, cache: muscleHeatmapCache });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Cache update failed." });
  }
});

// ============================================
// List Available Models
// ============================================
app.get("/api/models", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
    }
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
      }
    );
    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err || "ListModels failed." });
    }
    const json = await response.json();
    return res.json(json);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error." });
  }
});

// ============================================
// Health Check
// ============================================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    model: GEMINI_MODEL,
    hasApiKey: !!GEMINI_API_KEY,
    lastCacheUpdate,
  });
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Using Gemini model: ${GEMINI_MODEL}`);
});
