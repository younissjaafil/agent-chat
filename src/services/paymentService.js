/**
 * PaymentService - Handles integration with external Whish payment microservice
 * API Base: Configured via PAYMENT_API_URL environment variable
 */

const axios = require("axios");

// Validate required environment variables
const requiredEnvVars = ["PAYMENT_API_URL", "BACKEND_URL", "FRONTEND_URL"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.warn(
    `⚠️ PaymentService: Missing environment variables: ${missingEnvVars.join(
      ", "
    )}. Payment functionality may not work correctly.`
  );
}

// Configuration from environment variables (no hardcoded defaults for security)
const config = Object.freeze({
  PAYMENT_API_URL: process.env.PAYMENT_API_URL,
  BACKEND_URL: process.env.BACKEND_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
});

/**
 * Validate configuration before making API calls
 * @throws {Error} If required configuration is missing
 */
function validateConfig() {
  if (!config.PAYMENT_API_URL) {
    throw new Error("PAYMENT_API_URL environment variable is not configured");
  }
  if (!config.BACKEND_URL) {
    throw new Error("BACKEND_URL environment variable is not configured");
  }
  if (!config.FRONTEND_URL) {
    throw new Error("FRONTEND_URL environment variable is not configured");
  }
}

/**
 * Create axios instance with security headers and timeout
 */
const paymentClient = axios.create({
  timeout: 30000, // 30 second timeout
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "AgentChat/1.0",
  },
});

class PaymentService {
  /**
   * Get account balance from Whish
   * @returns {Promise<{available: number, pending: number, total: number, currency: string}>}
   */
  static async getBalance() {
    validateConfig();

    try {
      const response = await paymentClient.get(
        `${config.PAYMENT_API_URL}/payments/balance`
      );
      return response.data;
    } catch (error) {
      console.error("❌ PaymentService.getBalance error:", error.message);
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  /**
   * Create a payment link for a user to pay for agent access
   * @param {Object} options Payment options
   * @param {string} options.userId - User ID making the payment
   * @param {string} options.agentId - Agent ID being paid for
   * @param {number} options.amount - Payment amount
   * @param {string} options.currency - Currency code (USD, LBP, AED)
   * @param {string} options.agentName - Agent name for invoice description
   * @param {number} options.paymentRecordId - Internal payment record ID (used as externalId)
   * @param {string} [options.successRedirectUrl] - Frontend URL for success redirect
   * @param {string} [options.failureRedirectUrl] - Frontend URL for failure redirect
   * @returns {Promise<{collectUrl: string, externalId: number}>}
   */
  static async createPayment({
    userId,
    agentId,
    amount,
    currency = "USD",
    agentName,
    paymentRecordId,
    successRedirectUrl,
    failureRedirectUrl,
  }) {
    validateConfig();

    // Input validation
    if (!userId || typeof userId !== "string") {
      throw new Error("Invalid userId: must be a non-empty string");
    }
    if (!agentId || typeof agentId !== "string") {
      throw new Error("Invalid agentId: must be a non-empty string");
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      throw new Error("Invalid amount: must be a positive number");
    }
    if (!PaymentService.isValidCurrency(currency)) {
      throw new Error("Invalid currency: must be USD, LBP, or AED");
    }
    if (!paymentRecordId) {
      throw new Error("Invalid paymentRecordId: required for payment tracking");
    }

    try {
      // Sanitize inputs
      const sanitizedUserId = String(userId).substring(0, 255);
      const sanitizedAgentId = String(agentId).substring(0, 255);
      const sanitizedAgentName = agentName
        ? String(agentName).substring(0, 100).replace(/[<>]/g, "")
        : sanitizedAgentId;

      const payload = {
        amount: parseFloat(amount),
        currency: currency.toUpperCase(),
        invoice: `Agent Access: ${sanitizedAgentName} - User: ${sanitizedUserId}`,
        externalId: paymentRecordId,
        successCallbackUrl: `${config.BACKEND_URL}/api/payments/webhook/success`,
        failureCallbackUrl: `${config.BACKEND_URL}/api/payments/webhook/failure`,
        successRedirectUrl:
          successRedirectUrl || `${config.FRONTEND_URL}/payment/success`,
        failureRedirectUrl:
          failureRedirectUrl || `${config.FRONTEND_URL}/payment/failed`,
      };

      // Log without sensitive data
      console.log("💳 Creating payment:", {
        amount: payload.amount,
        currency: payload.currency,
        externalId: payload.externalId,
      });

      const response = await paymentClient.post(
        `${config.PAYMENT_API_URL}/payments`,
        payload
      );

      console.log("✅ Payment created:", {
        externalId: response.data.externalId,
        hasCollectUrl: !!response.data.collectUrl,
      });

      return response.data;
    } catch (error) {
      console.error(
        "❌ PaymentService.createPayment error:",
        error.response?.data?.message || error.message
      );
      throw new Error(
        `Failed to create payment: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Check the status of a payment by external ID
   * @param {number} externalId - The payment record ID
   * @param {string} currency - Currency code
   * @returns {Promise<{collectStatus: string, payerPhoneNumber: string, externalId: number, currency: string}>}
   */
  static async checkPaymentStatus(externalId, currency = "USD") {
    validateConfig();

    // Input validation
    if (!externalId) {
      throw new Error("Invalid externalId: required for status check");
    }
    if (!PaymentService.isValidCurrency(currency)) {
      throw new Error("Invalid currency: must be USD, LBP, or AED");
    }

    try {
      const response = await paymentClient.post(
        `${config.PAYMENT_API_URL}/payments/status`,
        {
          externalId: parseInt(externalId),
          currency: currency.toUpperCase(),
        }
      );

      return response.data;
    } catch (error) {
      console.error(
        "❌ PaymentService.checkPaymentStatus error:",
        error.response?.data?.message || error.message
      );
      throw new Error(
        `Failed to check payment status: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Validate currency code
   * @param {string} currency - Currency to validate
   * @returns {boolean}
   */
  static isValidCurrency(currency) {
    return ["USD", "LBP", "AED"].includes(currency?.toUpperCase());
  }

  /**
   * Format price for display
   * @param {number} amount - Amount
   * @param {string} currency - Currency code
   * @returns {string}
   */
  static formatPrice(amount, currency = "USD") {
    const symbols = {
      USD: "$",
      LBP: "L.L.",
      AED: "AED ",
    };
    const symbol = symbols[currency?.toUpperCase()] || currency + " ";
    return `${symbol}${parseFloat(amount).toFixed(2)}`;
  }
}

module.exports = PaymentService;
