const express = require("express");
const ChatService = require("../services/chatService");
const DataService = require("../services/dataService");
const { pool } = require("../utils/database");

const router = express.Router();

// Simple chat endpoint - POST /api/chat
router.post("/", async (req, res) => {
  try {
    const { agentId, message, conversationHistory, userId } = req.body;

    // Validate required fields
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

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Message is required and must be a non-empty string",
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        success: false,
        error: "Message is too long (maximum 4000 characters)",
      });
    }

    // Generate AI response with optional userId for chat history context
    const result = await ChatService.generateResponse(
      agentId,
      message,
      conversationHistory,
      userId
    );

    res.json(result);
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to process chat request",
    });
  }
});

// Get agent information for chat using agentId
router.get("/agent/:agentId/info", async (req, res) => {
  try {
    const { agentId } = req.params;

    const agentInfo = await ChatService.getAgentInfo(agentId);

    if (!agentInfo) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    res.json({
      success: true,
      data: agentInfo,
    });
  } catch (error) {
    console.error("Get agent info error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// Get all agents (for agent selection)
router.get("/agents", async (req, res) => {
  try {
    const agents = await DataService.getAllAgents();

    // Format response for chat interface
    const chatAgents = agents.map((agent) => ({
      id: agent.id,
      agentId: agent.agent_id || agent.id,
      name: agent.name || agent.personality_name,
      traits: agent.trait_array,
      tone: agent.tone,
      description: agent.description,
      isActive: agent.is_active,
      createdAt: agent.created_at,
    }));

    res.json({
      success: true,
      data: chatAgents,
    });
  } catch (error) {
    console.error("Get agents error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// Get all personalities (for reference/legacy support)
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
      error: "Internal server error",
    });
  }
});

// Health check for chat service
router.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "Chat AI",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Debug endpoint to check database schema
router.get("/debug/schema", async (req, res) => {
  try {
    // Check what tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;

    const result = await pool.query(tablesQuery);
    const tables = result.rows.map((row) => row.table_name);

    // Check for personality and instance related tables
    const personalityTables = tables.filter((name) =>
      name.toLowerCase().includes("personality")
    );

    const instanceTables = tables.filter((name) =>
      name.toLowerCase().includes("instance")
    );

    res.json({
      success: true,
      data: {
        allTables: tables,
        personalityTables,
        instanceTables,
      },
    });
  } catch (error) {
    console.error("Schema check error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Add the generateAIResponse function before the route
const generateAIResponse = async (message, agent) => {
  try {
    // Create a personality-based prompt
    const traits = Array.isArray(agent.trait_array)
      ? agent.trait_array.join(", ")
      : "";
    const tone = agent.tone || "friendly";

    const prompt = `You are ${agent.name}, an AI assistant with the following personality traits: ${traits}. 
    Your communication tone is ${tone}. 
    Please respond to this message in character: "${message}"`;

    // For now, create a simple response based on personality
    // Later you can integrate with OpenAI, Claude, etc.
    let response = `Hello! I'm ${agent.name}. `;

    if (tone.toLowerCase().includes("friendly")) {
      response += "I'm here to help you in a warm and approachable way. ";
    } else if (tone.toLowerCase().includes("professional")) {
      response += "I'm here to assist you professionally. ";
    } else if (tone.toLowerCase().includes("creative")) {
      response += "I'm excited to explore creative solutions with you! ";
    } else {
      response += "I'm here to assist you. ";
    }

    response += `Regarding your message: "${message}" - `;

    // Add trait-based response elements
    if (traits.toLowerCase().includes("helpful")) {
      response += "I'd be happy to help you with that. ";
    }
    if (traits.toLowerCase().includes("analytical")) {
      response += "Let me think about this analytically. ";
    }
    if (traits.toLowerCase().includes("creative")) {
      response += "This is an interesting creative challenge! ";
    }

    response += "How can I assist you further?";

    return response;
  } catch (error) {
    console.error("AI Response generation error:", error);
    return "I'm sorry, I'm having trouble processing your message right now. Please try again.";
  }
};

// Update the chat endpoint (fix the SQL query)
router.post("/", async (req, res) => {
  try {
    const { userId, receiverId, text } = req.body;

    // Validate required fields
    if (!userId || !receiverId || !text) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: userId, receiverId, text",
      });
    }

    // Check if sender exists (userId can be any user)
    console.log(`Chat request: ${userId} -> ${receiverId}: "${text}"`);

    // Get the receiver's instance and personality data
    // Remove the i.id reference since it doesn't exist
    const instanceQuery = `
      SELECT 
        i.asid,
        i.userid as agent_owner,
        p.name as personality_name,
        p.trait_array,
        p.tone,
        p.asid as personality_asid
      FROM instances i 
      JOIN personality p ON i.asid = p.asid 
      WHERE i.userid = $1
      LIMIT 1
    `;

    const instanceResult = await pool.query(instanceQuery, [receiverId]);

    if (instanceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `User '${receiverId}' does not have an AI agent/personality to chat with`,
        hint: "Use /api/chat/debug/users-and-instances to see available agents",
      });
    }

    const agent = instanceResult.rows[0];

    // Generate AI response based on personality
    const aiResponse = await generateAIResponse(text, {
      name: agent.personality_name,
      trait_array: agent.trait_array,
      tone: agent.tone,
    });

    // Return the chat response (remove instanceId reference)
    res.json({
      success: true,
      data: {
        conversation: {
          sender: userId,
          receiver: receiverId,
          senderMessage: text,
          receiverResponse: aiResponse,
        },
        agentInfo: {
          agentOwner: agent.agent_owner,
          agentName: agent.personality_name,
          agentTraits: agent.trait_array,
          agentTone: agent.tone,
          asid: agent.asid,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Fix the debug endpoint (remove the column reference issue)
router.get("/debug/users-and-instances", async (req, res) => {
  try {
    // Get all instances with their personalities
    const instancesQuery = `
      SELECT 
        i.asid,
        i.userid as agent_userid,
        p.name as personality_name,
        p.trait_array,
        p.tone,
        i.created_at
      FROM instances i 
      JOIN personality p ON i.asid = p.asid 
      ORDER BY i.created_at DESC
    `;

    const result = await pool.query(instancesQuery);

    res.json({
      success: true,
      data: {
        availableAgents: result.rows,
        message:
          "These are users who have AI personalities that others can chat with",
        example: {
          description: "You can chat with these users:",
          chatExamples: result.rows.map((agent) => ({
            sendMessage: `POST /api/chat`,
            payload: {
              userId: "mo", // your user id
              receiverId: agent.agent_userid, // user who owns the agent
              text: "Hello! How are you?",
            },
            agentInfo: `${agent.agent_userid} has "${agent.personality_name}" personality`,
          })),
        },
      },
    });
  } catch (error) {
    console.error("Debug users error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
