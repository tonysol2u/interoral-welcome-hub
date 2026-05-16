const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

/**
 * POST /v1/release
 * Server-side Source of Truth: check balance >= rate, deduct atomically, return unlock_token.
 * Body: { user_id, service_type, case_id?, tooth_numbers? }
 */
router.post("/", async (req, res) => {
  const { pool } = require("../db");
  const client = await pool.connect();

  try {
    const { user_id, service_type, case_id, tooth_numbers } = req.body;
    if (!user_id || !service_type) return res.status(400).json({ error: "user_id and service_type required" });

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "0.0.0.0";
    let regionalFlag = "US";
    try {
      const geoRes = await fetch(`https://ipapi.co/${ip}/country_code/`, { signal: AbortSignal.timeout(3000) });
      if (geoRes.ok) {
        const code = (await geoRes.text()).trim().toUpperCase();
        if (code.length === 2) regionalFlag = code;
      }
    } catch {}

    // Check for custom per-user pricing FIRST
    const customResult = await client.query(
      "SELECT custom_rate FROM user_price_overrides WHERE user_id=$1 AND service_type=$2 LIMIT 1",
      [user_id, service_type]
    );

    let caseRate;
    let rateResult;

    if (customResult.rows.length > 0) {
      caseRate = parseFloat(customResult.rows[0].custom_rate);
      rateResult = { rows: [{ base_rate: caseRate, currency_symbol: "$", display_name: `${service_type} (custom)` }] };
    } else {
      rateResult = await client.query(
        "SELECT base_rate, currency_symbol, display_name FROM sovereign_pricing WHERE service_type=$1 AND regional_flag=$2 AND is_active=true LIMIT 1",
        [service_type, regionalFlag]
      );
      if (rateResult.rows.length === 0 && regionalFlag !== "US") {
        rateResult = await client.query(
          "SELECT base_rate, currency_symbol, display_name FROM sovereign_pricing WHERE service_type=$1 AND regional_flag='US' AND is_active=true LIMIT 1",
          [service_type]
        );
      }
      if (rateResult.rows.length === 0) return res.status(404).json({ error: "no_rate_configured" });
      caseRate = parseFloat(rateResult.rows[0].base_rate);
    }

    await client.query("BEGIN");

    const balResult = await client.query(
      "SELECT balance, lifetime_spent FROM design_token_balances WHERE user_id=$1 FOR UPDATE",
      [user_id]
    );
    const userBalance = balResult.rows.length > 0 ? parseFloat(balResult.rows[0].balance) : 0;

    if (userBalance < caseRate) {
      await client.query("ROLLBACK");
      return res.status(402).json({
        success: false,
        reason: "insufficient_funds",
        user_balance: userBalance,
        case_rate: caseRate,
        deficit: caseRate - userBalance,
        message: `Insufficient Credits. Need ${caseRate - userBalance} more tokens.`,
      });
    }

    const newBalance = userBalance - caseRate;
    const newSpent = parseFloat(balResult.rows[0]?.lifetime_spent || 0) + caseRate;

    await client.query(
      "UPDATE design_token_balances SET balance=$1, lifetime_spent=$2, updated_at=NOW() WHERE user_id=$3",
      [newBalance, newSpent, user_id]
    );

    await client.query(
      `INSERT INTO design_token_ledger (user_id, case_id, amount, direction, reason, units, metadata)
       VALUES ($1, $2, $3, 'debit', $4, $5, $6)`,
      [user_id, case_id || null, caseRate, `Download: ${rateResult.rows[0].display_name || service_type}`,
       tooth_numbers?.length || 1, JSON.stringify({ service_type, regional_flag: regionalFlag, tooth_numbers: tooth_numbers || [] })]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      unlock_token: uuidv4(),
      deducted: caseRate,
      new_balance: newBalance,
      message: "Files authorized for download.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
