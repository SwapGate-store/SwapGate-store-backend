// ...existing code...
const express = require("express");
const axios = require("axios");
const multer = require("multer");
const FormData = require("form-data");
const fs = require("fs");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const cors = require("cors");



const app = express();
app.use(cors({
  origin: ["*", "http://localhost", "http://127.0.0.1", "https://swapgate.vercel.app", "https://swapgate-store.com"],
  methods: ["GET", "POST", "PUT", "DELETE"],
}));
app.use(express.json());

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Telegram BotFather API",
      version: "1.0.0",
      description: "API to send a photo to Telegram bot",
    },
  },
  apis: [__filename],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const BOT_TOKEN = "8244783809:AAESM8DUsV9goMRYbGCjZxUtyYkw6UUtP_0";
const CHAT_ID = "5734946501";

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     responses:
 *       200:
 *         description: Backend is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});
/**
 * @openapi
 * /api/send-msg:
 *   post:
 *     summary: Send two files (bank slip and user summary PDF) to Telegram bot
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               bank_slip:
 *                 type: string
 *                 format: binary
 *                 description: Bank slip image or PDF file
 *               user_summary_pdf:
 *                 type: string
 *                 format: binary
 *                 description: User summary PDF file
 *             required:
 *               - bank_slip
 *               - user_summary_pdf
 *     responses:
 *       200:
 *         description: Files sent successfully to Telegram
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 telegram:
 *                   type: object
 *       400:
 *         description: Missing required files or invalid file types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       500:
 *         description: Error sending files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 error:
 *                   type: string
 */
const upload = multer({ dest: "uploads/" });
const path = require("path");
app.post("/api/send-msg", upload.fields([
  { name: "bank_slip", maxCount: 1 },
  { name: "user_summary_pdf", maxCount: 1 }
]), async (req, res) => {
  try {
    // Handle two file uploads only
    const bankSlipFile = req.files && req.files.bank_slip ? req.files.bank_slip[0] : null;
    const userSummaryFile = req.files && req.files.user_summary_pdf ? req.files.user_summary_pdf[0] : null;
    
    if (!bankSlipFile || !userSummaryFile) {
      return res.status(400).json({ success: false, error: "Both files (bank_slip and user_summary_pdf) are required" });
    }

    // Send bank slip without caption
    await sendFileToTelegram(bankSlipFile, "", "Bank_Slip");

    // Send user summary without caption
    const summaryResponse = await sendFileToTelegram(userSummaryFile, "", "User_Summary");

    // Send page break line after both files
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: "_____________________________________"
      }
    );

    res.json({ success: true, telegram: summaryResponse.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper function to send files to Telegram
async function sendFileToTelegram(file, caption, fileType) {
  const form = new FormData();
  form.append("chat_id", CHAT_ID);
  form.append("caption", caption);

  // Check file type: send as photo if image, else as document (PDF)
  const mimeType = file.mimetype;
  let telegramResponse;
  
  if (mimeType.startsWith("image/")) {
    form.append("photo", fs.createReadStream(file.path));
    telegramResponse = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      form,
      { headers: form.getHeaders() }
    );
  } else if (mimeType === "application/pdf") {
    // Create a descriptive filename for the PDF
    const now = new Date();
    const safeDate = now.toISOString().replace(/[:.]/g, "-");
    const newFilename = `${fileType.replace(/\s+/g, "_")}_${safeDate}_${file.originalname}`;
    const newFilePath = path.join(path.dirname(file.path), newFilename);
    fs.renameSync(file.path, newFilePath);
    
    form.append("document", fs.createReadStream(newFilePath), { filename: newFilename });
    telegramResponse = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders() }
    );
  } else {
    throw new Error(`Unsupported file type for ${fileType}. Please upload an image or PDF.`);
  }
  
  return telegramResponse;
}

app.listen(3000, () => console.log("Server running on port 3000"));
