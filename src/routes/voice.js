const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { transcribe } = require("../services/whisperService");
const { MiniMaxTTSService } = require("../services/miniMaxTTSService");
const { VoiceRecordingService } = require("../services/voiceRecordingService");
const ChatService = require("../services/chatService");
const DataService = require("../services/dataService");

const router = express.Router();

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../temp_audio");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `voice_${Date.now()}.wav`);
  },
});

const upload = multer({ storage });

// Voice chat endpoint - POST /voice
router.post("/", upload.single("audio"), async (req, res) => {
  try {
    const { asid, senderId, conversationHistory } = req.body;
    const audioFile = req.file;

    // Validate required fields
    if (!asid || typeof asid !== "string" || asid.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "asid is required and must be a non-empty string",
      });
    }

    if (!audioFile) {
      return res.status(400).json({
        success: false,
        error: "Audio file is required",
      });
    }

    console.log("🎙️ Processing voice chat request for asid:", asid);

    // Transcribe audio to text
    const transcriptionResult = await transcribe(audioFile.path);

    if (!transcriptionResult || !transcriptionResult.text) {
      return res.status(400).json({
        success: false,
        error: "Could not transcribe audio",
      });
    }

    const userMessage = transcriptionResult.text;
    console.log("📝 Transcribed message:", userMessage);

    // Generate AI response using chat service
    const chatResponse = await ChatService.generateResponse(
      asid,
      userMessage,
      conversationHistory ? JSON.parse(conversationHistory) : [],
      senderId
    );

    if (!chatResponse.success) {
      return res.status(500).json(chatResponse);
    }

    // Generate TTS audio for the response using the agent's cloned voice
    const ttsService = new MiniMaxTTSService();
    const audioOutputPath = path.join(
      __dirname,
      "../temp_audio",
      `response_${Date.now()}.mp3`
    );

    // Get the agent's voice ID (from the user who created the agent)
    const voiceId = await ttsService.getVoiceIdForAgent(senderId, asid);
    console.log(`🎤 Using voice ID ${voiceId} for agent ${asid}`);

    await ttsService.textToSpeech(
      chatResponse.response,
      audioOutputPath,
      voiceId,
      asid
    );

    // Return MP3 file directly by default (for Postman testing)
    // Use ?format=json to get JSON response instead
    if (req.query.format === "json") {
      // Return JSON with audio file path/URL for download
      // Create a unique filename that can be accessed via a download endpoint
      const audioFileName = `response_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.mp3`;
      const publicAudioPath = path.join(
        __dirname,
        "../temp_audio",
        audioFileName
      );

      // Copy the file to a public location (or you could move it)
      fs.copyFileSync(audioOutputPath, publicAudioPath);

      // Clean up original temp files
      fs.unlinkSync(audioFile.path);
      fs.unlinkSync(audioOutputPath);

      res.json({
        success: true,
        transcription: userMessage,
        response: chatResponse.response,
        audioFile: audioFileName, // Client can download this via /voice/download/:filename
        audioUrl: `/voice/download/${audioFileName}`, // Direct download URL
        conversationHistory: chatResponse.conversationHistory,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Default: Return the MP3 file directly (perfect for Postman)
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="response.mp3"'
      );

      // Send the audio file
      res.sendFile(audioOutputPath, (err) => {
        if (err) {
          console.error("Error sending audio file:", err);
        }

        // Clean up temp files after sending
        if (fs.existsSync(audioFile.path)) {
          fs.unlinkSync(audioFile.path);
        }
        if (fs.existsSync(audioOutputPath)) {
          fs.unlinkSync(audioOutputPath);
        }
      });
    }
  } catch (error) {
    console.error("Voice chat error:", error);

    // Clean up temp file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Download audio file endpoint - GET /voice/download/:filename
router.get("/download/:filename", (req, res) => {
  try {
    const filename = req.params.filename;

    // Validate filename for security
    if (!/^response_\d+_[a-z0-9]+\.mp3$/.test(filename)) {
      return res.status(400).json({
        success: false,
        error: "Invalid filename format",
      });
    }

    const filePath = path.join(__dirname, "../temp_audio", filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: "Audio file not found",
      });
    }

    // Set headers for audio file download
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Send the file and clean up after
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("Error sending audio file:", err);
      } else {
        // Delete the file after successful download
        setTimeout(() => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Cleaned up audio file: ${filename}`);
          }
        }, 1000); // Small delay to ensure download completes
      }
    });
  } catch (error) {
    console.error("Download audio error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get available voices endpoint - GET /voice/voices
router.get("/voices", async (req, res) => {
  try {
    const ttsService = new MiniMaxTTSService();
    const voices = ttsService.getAvailableVoices();

    res.json({
      success: true,
      voices: voices,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get voices error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
