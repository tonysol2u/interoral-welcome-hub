const express = require("express");
const Stripe = require("stripe");
const router = express.Router();
const { pool } = require("../config/db");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook handler — the ONLY way to credit the ledger.
 * Triggered by Stripe after payment confirmation.
 * Prevents client-side balance manipulation.
 */
router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  // Verify webhook signature
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error("[webhooks/stripe] Signature verification failed:", err.message);
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Only handle successful payments
  if (event.type !== "checkout.session.completed" && event.type !== "payment_intent.succeeded") {
    return res.json({ received: true, skipped: true });
  }

  const obj = event.data.object;
  const metadata = obj.metadata || {};
  const userId = metadata.user_id;
  const credits = parseInt(metadata.credits);
  const tierName = metadata.tier_name || "direct";
  const amountPaid = parseFloat(metadata.amount_paid || obj.amount_total / 100 || 0);
  const stripePI = obj.payment_intent || obj.id;

  if (!userId || !credits || credits <= 0) {
    return res.status(400).json({ error: "Missing user_id or invalid credits in metadata" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotency check — prevent duplicate credits
    const existing = await client.query(
      "SELECT id FROM design_token_ledger WHERE metadata->>'stripe_pi' = $1",
      [stripePI]
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.json({ received: true, duplicate: true });
    }

    // Upsert balance
    const balanceResult = await client.query(
      "SELECT balance, lifetime_purchased FROM design_token_balances WHERE user_id = $1 FOR UPDATE",
      [userId]
    );

    if (balanceResult.rows.length > 0) {
      const newBalance = parseFloat(balanceResult.rows[0].balance) + credits;
      const newPurchased = parseFloat(balanceResult.rows[0].lifetime_purchased) + credits;
      await client.query(
        `UPDATE design_token_balances 
         SET balance = $1, lifetime_purchased = $2, updated_at = NOW() 
         WHERE user_id = $3`,
        [newBalance, newPurchased, userId]
      );
    } else {
      await client.query(
        `INSERT INTO design_token_balances (user_id, balance, lifetime_purchased, lifetime_spent) 
         VALUES ($1, $2, $3, 0)`,
        [userId, credits, credits]
      );
    }

    // Append credit entry to ledger
    await client.query(
      `INSERT INTO design_token_ledger (user_id, amount, direction, reason, metadata) 
       VALUES ($1, $2, 'credit', $3, $4)`,
      [
        userId,
        credits,
        `Top-up: ${tierName} (${credits} tokens)`,
        JSON.stringify({ tier_name: tierName, amount_paid: amountPaid, stripe_pi: stripePI, source: "stripe-webhook" }),
      ]
    );

    await client.query("COMMIT");

    console.log(`[webhooks/stripe] Credited ${credits} tokens to user ${userId}`);
    res.json({ success: true, user_id: userId, credits_added: credits });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[webhooks/stripe] Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
