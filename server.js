require("dotenv").config();
const express = require("express");
const axios = require("axios");
const path = require("path");
const cors = require("cors");
const serverlessExpress = require("@vendia/serverless-express");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const BUCKET = process.env.S3_BUCKET;

const app = express();

app.use(cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/presign", async (req, res) => {
  try {
    const { fileNames } = req.body; // array of original filenames

    const urls = await Promise.all(
      fileNames.map(async (name) => {
        const key = `uploads/${uuidv4()}-${name}`;
        const url = await getSignedUrl(
          s3,
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ContentType: "image/jpeg",
          }),
          { expiresIn: 300 }, // 5 minutes
        );
        return { key, url };
      }),
    );

    res.json({ urls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/extract-bulk", async (req, res) => {
  try {
    const { keys } = req.body; // array of S3 keys

    const BATCH_SIZE = 5; // process 5 at a time to avoid rate limits
    const results = [];

    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (key) => {
          try {
            // Fetch image from S3
            const s3Response = await s3.send(
              new GetObjectCommand({ Bucket: BUCKET, Key: key }),
            );
            const chunks = [];
            for await (const chunk of s3Response.Body) chunks.push(chunk);
            const imageBase64 = Buffer.concat(chunks).toString("base64");

            // Call Vision API
            const VISION_URL = `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`;
            const { data } = await axios.post(VISION_URL, {
              requests: [
                {
                  image: { content: imageBase64 },
                  features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                },
              ],
            });

            const text =
              data.responses[0]?.fullTextAnnotation?.text || "No text found";
            return { key, text, status: "success" };
          } catch (err) {
            return { key, text: null, status: "error", error: err.message };
          }
        }),
      );

      results.push(...batchResults);
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
