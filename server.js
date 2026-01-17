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

