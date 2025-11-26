const express = require("express");
const router = express.Router();
const DataService = require("../services/dataService");
const ChatService = require("../services/chatService");
const { MiniMaxTTSService } = require("../services/miniMaxTTSService");
const PaymentService = require("../services/paymentService");

// Initialize TTS service
const ttsService = new MiniMaxTTSService();

/**
 * Helper function to check if user has access to a paid agent
 * Returns null if access is allowed, or an error response object if payment is required
 */
async function checkPaymentAccess(userId, agentId) {
  try {
    const access = await DataService.checkAgentAccess(userId, agentId);

    if (!access.allowed && access.requiresPayment) {
      return {
        success: false,
        error: "Payment required",
        requiresPayment: true,
        pricing: {
          agentId,
          name: access.pricing?.name,
          amount: access.pricing?.priceAmount,
          currency: access.pricing?.priceCurrency,
          formattedPrice: PaymentService.formatPrice(
            access.pricing?.priceAmount,
            access.pricing?.priceCurrency
          ),
        },
        message: `This agent requires payment of ${PaymentService.formatPrice(
          access.pricing?.priceAmount,
          access.pricing?.priceCurrency
        )} to access. Please complete payment first.`,
        paymentUrl: `/api/agents/${agentId}/payment/create`,
      };
    }

    return null; // Access allowed
  } catch (error) {
    console.error("Error checking payment access:", error);
    // On error, allow access to prevent blocking users
    return null;
  }
}

// GET /v1/chai/getHistory - Get chat history between user and AI agent
router.get("/getHistory", async (req, res) => {
  try {
    const { userId, agentId, limit = 50, offset = 0 } = req.query;

    // Validation
    if (!userId || !agentId) {
      return res.status(400).json({
        success: false,
        error: "Both userId and agentId are required",
      });
    }

    // Validate limit (1-1000)
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      return res.status(400).json({
        success: false,
        error: "Limit must be a number between 1 and 1000",
      });
    }

    // Validate offset (>= 0)
    const parsedOffset = parseInt(offset);
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        error: "Offset must be a non-negative number",
      });
    }

    console.log(
      `📖 Getting chat history for user: ${userId}, agent: ${agentId}`
    );

    const result = await DataService.getChaiChatHistory(
      userId,
      agentId,
      parsedLimit,
      parsedOffset
    );

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get chat history error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /v1/chai/chat - Send a text chat message
router.post("/chat", async (req, res) => {
  try {
    const { userId, message, agentId } = req.body;

    if (!userId || !message || !agentId) {
      return res.status(400).json({
        success: false,
        error: "userId, message, and agentId are required",
      });
    }

    console.log(
      `💬 Text chat request from user ${userId} for agent ${agentId}`
    );

    // Check payment access for paid agents
    const paymentRequired = await checkPaymentAccess(userId, agentId);
    if (paymentRequired) {
      console.log(`💰 Payment required for agent ${agentId}`);
      return res.status(402).json(paymentRequired);
    }

    console.log(`📝 Message: ${message}`);

    // Get conversation history for context
    const history = await DataService.getChaiChatHistory(
      userId,
      agentId,
      10,
      0
    );
    const conversationHistory = history.messages || [];

    // Generate text response using ChatService
    const response = await ChatService.generateResponse(
      agentId,
      message,
      conversationHistory,
      userId
    );

    // Extract string response from ChatService result
    let textResponse;
    if (typeof response === "string") {
      textResponse = response;
    } else if (response && typeof response === "object" && response.response) {
      textResponse = response.response;
    } else if (response && typeof response === "object" && response.content) {
      textResponse = response.content;
    } else {
      textResponse = String(
        response ||
          "I'm having trouble thinking right now. Could you ask me again?"
      );
    }

    console.log(`🤖 AI response: ${textResponse}`);

    res.json({
      success: true,
      data: {
        userId,
        agentId,
        userMessage: message,
        response: textResponse,
        conversationId: `${userId}_${agentId}_${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /v1/chai/voiceChat - Send a voice chat message
router.post("/voiceChat", async (req, res) => {
  try {
    const { userId, message, agentId } = req.body;

    if (!userId || !message || !agentId) {
      return res.status(400).json({
        success: false,
        error: "userId, message, and agentId are required",
      });
    }

    // 1. Store user message
    await DataService.storeUserMessage(userId, agentId, message);

    // 2. Process with AI
    const aiResponse = await ChatService.getAIResponse(message);

    // 3. Convert AI response to speech using TTS
    const audioUrl = await ttsService.convertTextToSpeech(aiResponse);

    // 4. Store AI response and audio URL
    await DataService.storeAIResponse(userId, agentId, aiResponse, audioUrl);

    // 5. Return response
    res.json({
      success: true,
      data: {
        userId,
        agentId,
        userMessage: message,
        aiResponse,
        audioUrl,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Voice chat error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /v1/chai/voice - Voice chat endpoint with text-to-speech
router.post("/voice", async (req, res) => {
  try {
    const { userId, asid, message, voiceOptions = {} } = req.body;

    if (!userId || !asid || !message) {
      return res.status(400).json({
        success: false,
        error: "userId, asid, and message are required",
      });
    }

    console.log(`🎤 Voice chat request from ${userId} for agent ${asid}`);

    // Check payment access for paid agents
    const paymentRequired = await checkPaymentAccess(userId, asid);
    if (paymentRequired) {
      console.log(`💰 Payment required for agent ${asid}`);
      return res.status(402).json(paymentRequired);
    }

    console.log(`📝 Message: ${message}`);

    // Generate text response using ChatService (without conversation history for voice)
    // This avoids encrypted database issues while maintaining OpenAI GPT-4 tone and personality
    const response = await ChatService.generateResponse(
      asid,
      message,
      [], // Empty conversation history for voice chat to avoid encryption issues
      userId
    );

    // Extract string response from ChatService result
    let textResponse;
    if (typeof response === "string") {
      textResponse = response;
    } else if (response && typeof response === "object" && response.response) {
      textResponse = response.response;
    } else if (response && typeof response === "object" && response.content) {
      textResponse = response.content;
    } else {
      textResponse = String(
        response ||
          "I'm having trouble thinking right now. Could you ask me again?"
      );
    }

    console.log(`🤖 AI response: ${textResponse}`);

    // Configure voice settings from voiceOptions
    const voiceSettings = {
      tone: voiceOptions.tone || "neutral",
      speed: voiceOptions.speed || 1.0,
      volume: voiceOptions.volume || 1.0,
      pitch: voiceOptions.pitch || 0,
      format: voiceOptions.format || "mp3",
    };

    console.log(`🎵 Voice settings:`, voiceSettings);

    // Convert text response to speech
    let audioData = null;
    let audioFormat = voiceSettings.format;

    try {
      console.log(`🗣️ Converting text to speech...`);

      // Create a temporary filename for the audio
      const timestamp = Date.now();
      const tempAudioFile = `temp_voice_${timestamp}.${audioFormat}`;

      // Get the appropriate voice ID for this user/agent combination
      const voiceId = await ttsService.getVoiceIdForAgent(userId, asid);

      // Generate audio using MiniMax TTS with dynamic voice ID
      const audioFile = await ttsService.textToSpeech(
        textResponse,
        tempAudioFile,
        voiceId
      );

      // Read the generated audio file and convert to base64
      const fs = require("fs");
      const audioBuffer = fs.readFileSync(audioFile);
      const audioBase64 = audioBuffer.toString("base64");

      // Clean up temp file
      fs.unlinkSync(audioFile);

      // Create response in the format expected by voice-chat-demo
      audioData = {
        base_resp: {
          status_msg: "success",
          status_code: 0,
        },
        data: {
          audio: audioBase64,
          audio_url: null, // We're providing base64 data instead
        },
      };

      console.log(
        `✅ Audio generated successfully (${Math.round(
          audioBuffer.length / 1024
        )} KB)`
      );
    } catch (audioError) {
      console.error("❌ TTS generation failed:", audioError.message);

      // Create a mock response indicating TTS failure but still return the text
      audioData = {
        base_resp: {
          status_msg: "invalid api key",
          status_code: 1001,
        },
        data: null,
      };
    }

    // Return response in the format expected by voice-chat-demo
    res.json({
      success: true,
      data: {
        textResponse: textResponse,
        audioData: audioData,
        audioFormat: audioFormat,
        voiceSettings: voiceSettings,
        conversationId: `${userId}_${asid}_${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Voice chat error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
