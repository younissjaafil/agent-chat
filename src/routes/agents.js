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
    const result = await pool.query(
      "SELECT * FROM agents ORDER BY name"
    );

    // Format agents
    const formattedAgents = result.rows.map((agent) => ({
      id: agent.id,
      agentId: agent.id.toString(), // Use integer ID as agentId
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
 * Supports integer IDs only
 */
router.get("/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params;

    console.log(`🔍 Fetching agent with ID: ${agentId}`);

    // Parse the agentId as integer
    const agentIdInt = parseInt(agentId);
    
    if (isNaN(agentIdInt)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agent ID. Must be a number.",
        timestamp: new Date().toISOString(),
      });
    }

    // Query the agents table
    const result = await pool.query(
      "SELECT * FROM agents WHERE id = $1",
      [agentIdInt]
    );

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
      agentId: agent.id.toString(),
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
