/**
 * Payment Routes - Webhook handlers and payment status endpoints
 */

const express = require("express");
const router = express.Router();
const DataService = require("../services/dataService");
const PaymentService = require("../services/paymentService");

/**
 * GET /api/payments/webhook/success - Success webhook from Whish payment
 * Called when payment is completed successfully
 */
router.get("/webhook/success", async (req, res) => {
  try {
    const { externalId, status } = req.query;

    console.log(`✅ Payment success webhook received:`, { externalId, status });

    if (!externalId) {
      console.error("❌ Missing externalId in success webhook");
      return res.status(400).send("Missing externalId");
    }

    // Get payment record
    const payment = await DataService.getPaymentByExternalId(externalId);

    if (!payment) {
      console.error(`❌ Payment not found for externalId: ${externalId}`);
      return res.status(404).send("Payment not found");
    }

    // Verify with payment service and get payer details
    let payerPhone = null;
    try {
      const statusResult = await PaymentService.checkPaymentStatus(
        externalId,
        payment.currency
      );
      payerPhone = statusResult.payerPhoneNumber;
    } catch (err) {
      console.warn("⚠️ Could not verify payment status:", err.message);
    }

    // Update payment status to success
    await DataService.updatePaymentStatus(externalId, "success", {
      payerPhone,
      metadata: { webhookReceived: new Date().toISOString() },
    });

    console.log(`✅ Payment ${externalId} marked as success`);

    // Return OK to acknowledge webhook
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Payment success webhook error:", error);
    res.status(500).send("Internal server error");
  }
});

/**
 * GET /api/payments/webhook/failure - Failure webhook from Whish payment
 * Called when payment fails
 */
router.get("/webhook/failure", async (req, res) => {
  try {
    const { externalId, status } = req.query;

    console.log(`❌ Payment failure webhook received:`, { externalId, status });

    if (!externalId) {
      console.error("❌ Missing externalId in failure webhook");
      return res.status(400).send("Missing externalId");
    }

    // Update payment status to failed
    await DataService.updatePaymentStatus(externalId, "failed", {
      metadata: {
        webhookReceived: new Date().toISOString(),
        failureReason: status || "unknown",
      },
    });

    console.log(`❌ Payment ${externalId} marked as failed`);

    // Return OK to acknowledge webhook
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Payment failure webhook error:", error);
    res.status(500).send("Internal server error");
  }
});

/**
 * GET /api/payments/balance - Get Whish account balance
 */
router.get("/balance", async (req, res) => {
  try {
    const balance = await PaymentService.getBalance();

    res.json({
      success: true,
      data: balance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Get balance error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/payments/verify - Manually verify a payment status
 * Body: { paymentId: number } - The internal payment record ID
 */
router.post("/verify", async (req, res) => {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: "paymentId is required",
        timestamp: new Date().toISOString(),
      });
    }

    // Get payment record
    const payment = await DataService.getPaymentByExternalId(
      paymentId.toString()
    );

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: "Payment not found",
        timestamp: new Date().toISOString(),
      });
    }

    // Check status with payment service
    const statusResult = await PaymentService.checkPaymentStatus(
      paymentId,
      payment.currency
    );

    // Update local status if needed
    if (statusResult.collectStatus !== payment.status) {
      await DataService.updatePaymentStatus(
        paymentId.toString(),
        statusResult.collectStatus,
        {
          payerPhone: statusResult.payerPhoneNumber,
          metadata: { verifiedAt: new Date().toISOString() },
        }
      );
    }

    // Get updated payment record
    const updatedPayment = await DataService.getPaymentByExternalId(
      paymentId.toString()
    );

    res.json({
      success: true,
      data: {
        paymentId,
        status: statusResult.collectStatus,
        payerPhone: statusResult.payerPhoneNumber,
        currency: statusResult.currency,
        payment: updatedPayment,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Verify payment error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/payments/user/:userId - Get all payments for a user
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    const payments = await DataService.getUserPayments(userId, parseInt(limit));

    res.json({
      success: true,
      data: {
        userId,
        payments: payments.map((p) => ({
          id: p.id,
          agentId: p.agent_id,
          agentName: p.agent_name,
          amount: parseFloat(p.amount),
          currency: p.currency,
          formattedPrice: PaymentService.formatPrice(p.amount, p.currency),
          status: p.status,
          collectUrl: p.collect_url,
          paidAt: p.paid_at,
          createdAt: p.created_at,
        })),
        count: payments.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Get user payments error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
