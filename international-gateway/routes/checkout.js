const express = require("express");
const router = express.Router();

/**
 * POST /v1/checkout/create
 * Creates a Stripe Checkout session for credit purchases.
 * After payment, Stripe fires webhook to /v1/webhooks/stripe which credits the ledger.
 */
router.post("/create", async (req, res) => {
  try {
    const Stripe = require("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: "Stripe not configured. Add STRIPE_SECRET_KEY to .env" });
    }

    const { credits, amount, user_email, user_id, tier_name } = req.body;

    if (!credits || !amount || !user_email) {
      return res.status(400).json({ error: "credits, amount, and user_email required" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user_email,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `${credits} MasterCredits`,
            description: `${tier_name || credits + " credits"} — MasterSTL.ai`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      metadata: {
        user_id: user_id || user_email,
        credits: String(credits),
        tier_name: tier_name || `${credits}_credits`,
        amount_paid: String(amount),
      },
      success_url: (process.env.SUCCESS_URL || "https://masterstl.ai") + "?payment=success&credits=" + credits,
      cancel_url: (process.env.CANCEL_URL || "https://masterstl.ai") + "?payment=cancelled",
    });

    res.json({ sessionUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error("[checkout] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
