const express = require("express");
const router = express.Router();
const { pool } = require("../utils/database");
const DataService = require("../services/dataService");
const PaymentService = require("../services/paymentService");

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

// ==================== PAYMENT ENDPOINTS ====================

/**
 * GET /agents/:agentId/pricing - Get pricing info for an agent
 * Returns role (free/paid), price amount, and currency
 */
router.get("/:agentId/pricing", async (req, res) => {
  try {
    const { agentId } = req.params;
    console.log(`💰 Getting pricing for agent: ${agentId}`);

    const pricing = await DataService.getAgentPricing(agentId);

    if (!pricing) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      data: {
        agentId,
        name: pricing.name,
        role: pricing.role,
        isPaid: pricing.role === "paid",
        price: pricing.priceAmount,
        currency: pricing.priceCurrency,
        formattedPrice: PaymentService.formatPrice(
          pricing.priceAmount,
          pricing.priceCurrency
        ),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Get agent pricing error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /agents/:agentId/payment/create - Create a payment for agent access
 * Requires: userId in body
 * Optional: successRedirectUrl, failureRedirectUrl in body
 */
router.post("/:agentId/payment/create", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { userId, successRedirectUrl, failureRedirectUrl } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required",
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`💳 Creating payment for agent ${agentId}, user ${userId}`);

    // Get agent pricing
    const pricing = await DataService.getAgentPricing(agentId);

    if (!pricing) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
        timestamp: new Date().toISOString(),
      });
    }

    if (pricing.role !== "paid" || !pricing.priceAmount) {
      return res.status(400).json({
        success: false,
        error: "This agent is free and does not require payment",
        timestamp: new Date().toISOString(),
      });
    }

    // Check if user already has access
    const hasPaid = await DataService.hasUserPaidForAgent(userId, agentId);
    if (hasPaid) {
      return res.status(400).json({
        success: false,
        error: "User already has access to this agent",
        timestamp: new Date().toISOString(),
      });
    }

    // Generate unique external ID for this payment
    const externalId =
      Date.now().toString() + Math.random().toString(36).substr(2, 5);

    // Create internal payment record first
    const paymentRecord = await DataService.createPaymentRecord({
      userId,
      agentId,
      externalId,
      amount: pricing.priceAmount,
      currency: pricing.priceCurrency,
      metadata: { agentName: pricing.name },
    });

    // Create payment with external service
    const paymentResult = await PaymentService.createPayment({
      userId,
      agentId,
      amount: pricing.priceAmount,
      currency: pricing.priceCurrency,
      agentName: pricing.name,
      paymentRecordId: paymentRecord.id, // Use DB record ID as externalId for Whish
      successRedirectUrl,
      failureRedirectUrl,
    });

    // Update record with collect URL
    await pool.query(
      `UPDATE agent_payments SET collect_url = $1, external_id = $2 WHERE id = $3`,
      [paymentResult.collectUrl, paymentRecord.id.toString(), paymentRecord.id]
    );

    res.status(201).json({
      success: true,
      data: {
        paymentId: paymentRecord.id,
        collectUrl: paymentResult.collectUrl,
        amount: pricing.priceAmount,
        currency: pricing.priceCurrency,
        formattedPrice: PaymentService.formatPrice(
          pricing.priceAmount,
          pricing.priceCurrency
        ),
        agentName: pricing.name,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Create payment error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /agents/:agentId/payment/status - Check payment status for a user
 * Query params: userId
 */
router.get("/:agentId/payment/status", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId query parameter is required",
        timestamp: new Date().toISOString(),
      });
    }

    console.log(
      `🔍 Checking payment status for agent ${agentId}, user ${userId}`
    );

    const access = await DataService.checkAgentAccess(userId, agentId);
    const payment = await DataService.getUserAgentPayment(userId, agentId);

    res.json({
      success: true,
      data: {
        agentId,
        userId,
        hasAccess: access.allowed,
        requiresPayment: access.requiresPayment,
        pricing: access.pricing,
        latestPayment: payment
          ? {
              id: payment.id,
              status: payment.status,
              amount: parseFloat(payment.amount),
              currency: payment.currency,
              collectUrl: payment.collect_url,
              paidAt: payment.paid_at,
              createdAt: payment.created_at,
            }
          : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Check payment status error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * PUT /agents/:agentId/pricing - Update agent pricing (admin endpoint)
 * Body: { role: 'free'|'paid', priceAmount: number, priceCurrency: string }
 */
router.put("/:agentId/pricing", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { role, priceAmount, priceCurrency } = req.body;

    // Validate input
    if (!role || !["free", "paid"].includes(role)) {
      return res.status(400).json({
        success: false,
        error: "role must be 'free' or 'paid'",
        timestamp: new Date().toISOString(),
      });
    }

    if (role === "paid") {
      if (!priceAmount || priceAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: "priceAmount must be greater than 0 for paid agents",
          timestamp: new Date().toISOString(),
        });
      }

      if (!PaymentService.isValidCurrency(priceCurrency)) {
        return res.status(400).json({
          success: false,
          error: "priceCurrency must be USD, LBP, or AED",
          timestamp: new Date().toISOString(),
        });
      }
    }

    console.log(`💰 Updating pricing for agent ${agentId}:`, {
      role,
      priceAmount,
      priceCurrency,
    });

    await DataService.updateAgentPricing(agentId, {
      role,
      priceAmount: role === "paid" ? priceAmount : null,
      priceCurrency: role === "paid" ? priceCurrency : "USD",
    });

    const updatedPricing = await DataService.getAgentPricing(agentId);

    res.json({
      success: true,
      data: updatedPricing,
      message: `Agent pricing updated successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Update agent pricing error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
