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

const parseJsonFromText = (text) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw error;
    return JSON.parse(match[0]);
  }
};

app.post("/api/analyze", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
    }
    const { text } = req.body || {};
    if (!text) {
      return res.status(400).json({ error: "Missing text." });
    }

    const systemPrompt =
      'You are a fitness data extractor. Extract the following JSON from the user\'s natural language workout log: { "muscles": ["list", "of", "muscles"], "exertion_score": 1-10, "cardio_detected": boolean, "summary": "short summary" }. Return ONLY raw JSON.';

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
                { text: `Workout log: "${text}"` },
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
        error:
          err ||
          "Gemini request failed. Set GEMINI_MODEL or call /api/models.",
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// AI-powered workout recommendation
app.post("/api/recommend", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
    }

    const { logs } = req.body || {};
    const recentWorkouts = (logs || [])
      .slice(0, 5)
      .map((log) => ({
        muscles: log.muscles_hit || [],
        cardio: log.cardio_detected || false,
        date: log.created_at,
      }));

    const systemPrompt = `You are a fitness coach AI. Based on the user's recent workout history, suggest the best workout for today. Consider muscle recovery (don't work the same muscles 2 days in a row), balance (alternate between push/pull/legs), and variety.

Recent workouts (most recent first):
${JSON.stringify(recentWorkouts, null, 2)}

Return ONLY a JSON object with:
{
  "workout": "Name of suggested workout (e.g., 'Upper Body Push', 'Leg Day', 'Full Body Strength', 'Active Recovery', 'Core & Cardio')",
  "reason": "1-2 sentence explanation of why this workout is recommended based on their history"
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

