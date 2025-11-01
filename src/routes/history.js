const express = require("express");
const DataService = require("../services/dataService");

const router = express.Router();

// Get chat history endpoint - GET /getHistory
router.get("/", async (req, res) => {
  try {
    const { userId, agentId, limit = 50, offset = 0 } = req.query;

    // Validation
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "userId is required and must be a non-empty string",
      });
    }

    if (
      !agentId ||
      typeof agentId !== "string" ||
      agentId.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: "agentId is required and must be a non-empty string",
      });
    }

    console.log(
      `📚 Getting chat history between user ${userId} and agent ${agentId}`
    );

    // Get chat history from database
    const history = await DataService.getChatHistory(
      userId,
      agentId,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      history: history,
      userId: userId,
      agentId: agentId,
      limit: parseInt(limit),
      offset: parseInt(offset),
      count: history.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get history error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user's chat history endpoint - GET /getHistory/user/:userId
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    // Validate required fields
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "userId is required and must be a non-empty string",
      });
    }

    console.log(`📚 Getting all chat history for user ${userId}`);

    // Get user's chat history from database
    const history = await DataService.getUserChatHistory(
      userId,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      history: history,
      userId: userId,
      limit: parseInt(limit),
      offset: parseInt(offset),
      count: history.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get user history error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get latest messages endpoint - GET /getHistory/latest
router.get("/latest", async (req, res) => {
  try {
    const { userId, agentId, count = 10 } = req.query;

    // Validate required fields
    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "userId is required and must be a non-empty string",
      });
    }

    if (
      !agentId ||
      typeof agentId !== "string" ||
      agentId.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: "agentId is required and must be a non-empty string",
      });
    }

    console.log(
      `📚 Getting latest ${count} messages between user ${userId} and agent ${agentId}`
    );

    // Get latest messages from database
    const messages = await DataService.getLatestMessages(
      userId,
      agentId,
      parseInt(count)
    );

    res.json({
      success: true,
      messages: messages,
      userId: userId,
      agentId: agentId,
      count: parseInt(count),
      retrieved: messages.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get latest messages error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
