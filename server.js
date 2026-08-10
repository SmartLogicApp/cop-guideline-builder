const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
const ANTHROPIC_API_KEY =
  "sk-ant-api03-WK6EgLPkOiu92N992Yrhb3q58BeFFTNuzzWUjki8o5AKaPAY1L49TVUTppvPrjrWBz5vT-vJFRDQvg558QA-a1JRMwAA";
app.post("/api/generate", async (req, res) => {
  try {
    const { systemPrompt, userContent, maxTokens } = req.body;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens || 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
