const express = require("express");
const router = express.Router();

/**
 * POST /v1/webhooks/stripe
 * Stripe webhook — the ONLY way credits enter the ledger.
 * Validates signature, idempotent, atomic.
 */
router.post("/", express.raw({ type: "application/json" }), async (req, res) => {
  const { pool } = require("../db");
  const Stripe = require("stripe");
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "payment_intent.succeeded") {
    return res.json({ received: true, skipped: true });
  }

  const metadata = event.data?.object?.metadata || {};
  const userId = metadata.user_id;
  const credits = parseInt(metadata.credits);
  const tierName = metadata.tier_name || "direct";
  const stripePI = event.data?.object?.payment_intent || event.data?.object?.id;

  if (!userId || !credits || credits <= 0) {
    return res.status(400).json({ error: "Missing metadata" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dup = await client.query("SELECT id FROM design_token_ledger WHERE metadata->>'stripe_pi'=$1", [stripePI]);
    if (dup.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.json({ received: true, duplicate: true });
    }

    const bal = await client.query("SELECT balance, lifetime_purchased FROM design_token_balances WHERE user_id=$1 FOR UPDATE", [userId]);

    if (bal.rows.length > 0) {
      await client.query(
        "UPDATE design_token_balances SET balance=balance+$1, lifetime_purchased=lifetime_purchased+$1, updated_at=NOW() WHERE user_id=$2",
        [credits, userId]
      );
    } else {
      await client.query(
        "INSERT INTO design_token_balances (user_id, balance, lifetime_purchased, lifetime_spent) VALUES ($1,$2,$2,0)",
        [userId, credits]
      );
    }

    await client.query(
      "INSERT INTO design_token_ledger (user_id, amount, direction, reason, metadata) VALUES ($1,$2,'credit',$3,$4)",
      [userId, credits, `Top-up: ${tierName} (${credits} tokens)`, JSON.stringify({ tier_name: tierName, stripe_pi: stripePI })]
    );

    await client.query("COMMIT");
    res.json({ success: true, credits_added: credits });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
