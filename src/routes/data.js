const express = require("express");
const DataService = require("../services/dataService");

const router = express.Router();

// Get all personalities
router.get("/personalities", async (req, res) => {
  try {
    const personalities = await DataService.getAllPersonalities();
    res.json({
      success: true,
      data: personalities,
    });
  } catch (error) {
    console.error("Get personalities error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get personalities",
    });
  }
});

// Get personality by ID
router.get("/personality/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const personality = await DataService.getPersonalityById(id);

    if (!personality) {
      return res.status(404).json({
        success: false,
        error: "Personality not found",
      });
    }

    res.json({
      success: true,
      data: personality,
    });
  } catch (error) {
    console.error("Get personality error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get personality",
    });
  }
});

// Get personality by asid
router.get("/personality/asid/:asid", async (req, res) => {
  try {
    const { asid } = req.params;
    const personality = await DataService.getPersonalityByAsid(asid);

    if (!personality) {
      return res.status(404).json({
        success: false,
        error: "Personality not found",
      });
    }

    res.json({
      success: true,
      data: personality,
    });
  } catch (error) {
    console.error("Get personality by asid error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get personality",
    });
  }
});

// Get instance by ID
router.get("/instance/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const instance = await DataService.getInstanceById(id);

    if (!instance) {
      return res.status(404).json({
        success: false,
        error: "Instance not found",
      });
    }

    res.json({
      success: true,
      data: instance,
    });
  } catch (error) {
    console.error("Get instance error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get instance",
    });
  }
});

// Get instance by asid
router.get("/instance/asid/:asid", async (req, res) => {
  try {
    const { asid } = req.params;
    const instance = await DataService.getInstanceByAsid(asid);

    if (!instance) {
      return res.status(404).json({
        success: false,
        error: "Instance not found",
      });
    }

    res.json({
      success: true,
      data: instance,
    });
  } catch (error) {
    console.error("Get instance by asid error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get instance",
    });
  }
});

// Get instances by user ID
router.get("/instances/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const instances = await DataService.getInstancesByUserId(userId);

    res.json({
      success: true,
      data: instances,
    });
  } catch (error) {
    console.error("Get user instances error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user instances",
    });
  }
});

// Get instance with personality data by asid
router.get("/instance/:asid/with-personality", async (req, res) => {
  try {
    const { asid } = req.params;
    const instanceWithPersonality =
      await DataService.getInstanceWithPersonality(asid);

    if (!instanceWithPersonality) {
      return res.status(404).json({
        success: false,
        error: "Instance not found",
      });
    }

    res.json({
      success: true,
      data: instanceWithPersonality,
    });
  } catch (error) {
    console.error("Get instance with personality error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get instance with personality",
    });
  }
});

// Get user instances with personality data
router.get("/instances/user/:userId/with-personality", async (req, res) => {
  try {
    const { userId } = req.params;
    const instances = await DataService.getUserInstancesWithPersonality(userId);

    res.json({
      success: true,
      data: instances,
    });
  } catch (error) {
    console.error("Get user instances with personality error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user instances with personality",
    });
  }
});

// === CHAT HISTORY ROUTES ===

// Initialize chat history table
router.post("/chat-history/init", async (req, res) => {
  try {
    await DataService.createChatHistoryTable();
    res.json({
      success: true,
      message: "Chat history table created/verified successfully",
    });
  } catch (error) {
    console.error("Initialize chat history table error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to initialize chat history table",
    });
  }
});

// Store a chat message
router.post("/chat-history", async (req, res) => {
  try {
    const { sender_id, receiver_id, text, message_type } = req.body;

    if (!sender_id || !receiver_id || !text) {
      return res.status(400).json({
        success: false,
        error: "sender_id, receiver_id, and text are required",
      });
    }

    const message = await DataService.storeChatMessage(
      sender_id,
      receiver_id,
      text,
      message_type
    );

    res.json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("Store chat message error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to store chat message",
    });
  }
});

// Get chat history between two users
router.get("/chat-history/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const history = await DataService.getChatHistory(
      user1,
      user2,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("Get chat history error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get chat history",
    });
  }
});

// Get all chat history for a user
router.get("/chat-history/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const history = await DataService.getUserChatHistory(
      userId,
      parseInt(limit),
      parseInt(offset)
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("Get user chat history error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user chat history",
    });
  }
});

// Get latest messages between two users
router.get("/chat-history/:user1/:user2/latest", async (req, res) => {
  try {
    const { user1, user2 } = req.params;
    const { count = 10 } = req.query;

    const messages = await DataService.getLatestMessages(
      user1,
      user2,
      parseInt(count)
    );

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error("Get latest messages error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get latest messages",
    });
  }
});

// Delete chat history between two users
router.delete("/chat-history/:user1/:user2", async (req, res) => {
  try {
    const { user1, user2 } = req.params;

    const deletedCount = await DataService.deleteChatHistory(user1, user2);

    res.json({
      success: true,
      message: `Deleted ${deletedCount} messages`,
      deletedCount,
    });
  } catch (error) {
    console.error("Delete chat history error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete chat history",
    });
  }
});

module.exports = router;
