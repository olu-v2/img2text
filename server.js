require("dotenv").config();
const express = require("express");
const axios = require("axios");
const path = require("path");
const bodyParser = require("body-parser");
import serverlessExpress from "@vendia/serverless-express";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/extract-text", async (req, res) => {
  try {
    const { imageBase64 } = req.body;

    const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`;

    const { data } = await axios.post(VISION_URL, {
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    });

    const text = data.responses[0]?.fullTextAnnotation?.text || "No text found";
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All other routes serve the frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`),
);

exports.handler = serverlessExpress({ app });
