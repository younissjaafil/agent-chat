const express = require("express");
const router = express.Router();
const { pool } = require("../utils/database");

/**
 * GET /agents - Get all available agents for user to select
 * Returns agents from the agents table only
 */
router.get("/", async (req, res) => {
  try {
    console.log("📋 Fetching all available agents...");

    // Query agents table directly without requiring is_active column
    const result = await pool.query("SELECT * FROM agents ORDER BY name");

    // Format agents
    const formattedAgents = result.rows.map((agent) => ({
      id: agent.id,
      agentId: agent.agent_id, // Use UUID agent_id from database
      name: agent.name,
      personalityName: agent.personality_name,
      description: agent.description,
      tone: agent.tone,
      traits: agent.trait_array || [],
      model: agent.model,
      temperature: parseFloat(agent.temperature),
      maxTokens: agent.max_tokens,
      systemPrompt: agent.system_prompt,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    }));

    res.json({
      success: true,
      data: {
        agents: formattedAgents,
        count: formattedAgents.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Get agents error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /agents/:agentId - Get a specific agent by ID
 * Supports UUID agent_id or integer ID for backward compatibility
 */
router.get("/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;

    console.log(`🔍 Fetching agent with ID: ${agentId}`);

    // Try to determine if it's a UUID or integer ID
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        agentId
      );

    let result;
    if (isUUID) {
      // Query by UUID agent_id
      result = await pool.query("SELECT * FROM agents WHERE agent_id = $1", [
        agentId,
      ]);
    } else {
      // Try integer ID for backward compatibility
      const agentIdInt = parseInt(agentId);
      if (isNaN(agentIdInt)) {
        return res.status(400).json({
          success: false,
          error: "Invalid agent ID. Must be a UUID or number.",
          timestamp: new Date().toISOString(),
        });
      }
      result = await pool.query("SELECT * FROM agents WHERE id = $1", [
        agentIdInt,
      ]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
        timestamp: new Date().toISOString(),
      });
    }

    const agent = result.rows[0];

    // Format the response
    const formattedAgent = {
      id: agent.id,
      agentId: agent.agent_id, // Use UUID agent_id from database
      name: agent.name,
      personalityName: agent.personality_name,
      description: agent.description,
      tone: agent.tone,
      traits: agent.trait_array || [],
      systemPrompt: agent.system_prompt,
      model: agent.model,
      temperature: parseFloat(agent.temperature),
      maxTokens: agent.max_tokens,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    };

    res.json({
      success: true,
      data: formattedAgent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Get agent by ID error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
