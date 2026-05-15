const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");

/**
 * GET /api/ledger/balance — Get user's current credit balance
 */
router.get("/balance", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT balance, lifetime_purchased, lifetime_spent FROM design_token_balances WHERE user_id = $1",
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ balance: 0, lifetime_purchased: 0, lifetime_spent: 0 });
    }

    const row = result.rows[0];
    res.json({
      balance: parseFloat(row.balance),
      lifetime_purchased: parseFloat(row.lifetime_purchased),
      lifetime_spent: parseFloat(row.lifetime_spent),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/ledger/history — Get transaction history
 */
router.get("/history", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, amount, direction, reason, designer, units, metadata, created_at 
       FROM design_token_ledger 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/ledger/tiers — Get credit top-up tiers for user's region
 */
router.get("/tiers", async (req, res) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "0.0.0.0";

    let regionalFlag = "US";
    try {
      const geoRes = await fetch(`https://ipapi.co/${ip}/country_code/`, {
        signal: AbortSignal.timeout(3000),
      });
      if (geoRes.ok) {
        const code = (await geoRes.text()).trim().toUpperCase();
        if (code.length === 2) regionalFlag = code;
      }
    } catch {}

    let result = await pool.query(
      `SELECT * FROM credit_topup_tiers 
       WHERE regional_flag = $1 AND is_active = true 
       ORDER BY sort_order ASC`,
      [regionalFlag]
    );

    if (result.rows.length === 0) {
      result = await pool.query(
        `SELECT * FROM credit_topup_tiers 
         WHERE regional_flag = 'US' AND is_active = true 
         ORDER BY sort_order ASC`
      );
    }

    res.json({ tiers: result.rows, detected_region: regionalFlag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
