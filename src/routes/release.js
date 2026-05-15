const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");

/**
 * POST /api/release
 *
 * Server-side 'Release' authorization for file downloads.
 * THIS IS THE SOURCE OF TRUTH — UI cannot bypass.
 *
 * Logic:
 *   1. Authenticate user via JWT
 *   2. Look up Service_Rate from sovereign_pricing table
 *   3. Check: User_Balance >= Case_Rate
 *   4. If YES → deduct balance, generate unlock_token, return success
 *   5. If NO → return 402 { success: false, reason: "insufficient_funds" }
 *
 * Body: { service_type, case_id?, tooth_numbers? }
 */
router.post("/", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { service_type, case_id, tooth_numbers } = req.body;
    if (!service_type) {
      return res.status(400).json({ error: "service_type required" });
    }

    // Resolve region from IP
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

    // Look up rate
    let rateResult = await client.query(
      `SELECT base_rate, currency_symbol, display_name FROM sovereign_pricing 
       WHERE service_type = $1 AND regional_flag = $2 AND is_active = true LIMIT 1`,
      [service_type, regionalFlag]
    );

    if (rateResult.rows.length === 0 && regionalFlag !== "US") {
      rateResult = await client.query(
        `SELECT base_rate, currency_symbol, display_name FROM sovereign_pricing 
         WHERE service_type = $1 AND regional_flag = 'US' AND is_active = true LIMIT 1`,
        [service_type]
      );
    }

    if (rateResult.rows.length === 0) {
      return res.status(404).json({
        error: "no_rate_configured",
        message: `No pricing found for '${service_type}'. Contact admin.`,
      });
    }

    const caseRate = parseFloat(rateResult.rows[0].base_rate);
    const currencySymbol = rateResult.rows[0].currency_symbol;
    const displayName = rateResult.rows[0].display_name;

    // Begin transaction for atomic deduction
    await client.query("BEGIN");

    // Check balance (SELECT FOR UPDATE to lock row)
    const balanceResult = await client.query(
      "SELECT balance, lifetime_spent FROM design_token_balances WHERE user_id = $1 FOR UPDATE",
      [req.userId]
    );

    const userBalance = balanceResult.rows.length > 0
      ? parseFloat(balanceResult.rows[0].balance)
      : 0;

    // DECISION: Authorize or deny
    if (userBalance < caseRate) {
      await client.query("ROLLBACK");
      return res.status(402).json({
        success: false,
        reason: "insufficient_funds",
        user_balance: userBalance,
        case_rate: caseRate,
        deficit: caseRate - userBalance,
        currency_symbol: currencySymbol,
        message: `Insufficient Credits. You need ${caseRate - userBalance} more tokens.`,
      });
    }

    // Deduct balance
    const newBalance = userBalance - caseRate;
    const newSpent = parseFloat(balanceResult.rows[0]?.lifetime_spent || 0) + caseRate;

    await client.query(
      `UPDATE design_token_balances 
       SET balance = $1, lifetime_spent = $2, updated_at = NOW() 
       WHERE user_id = $3`,
      [newBalance, newSpent, req.userId]
    );

    // Append debit to ledger
    await client.query(
      `INSERT INTO design_token_ledger (user_id, case_id, amount, direction, reason, units, metadata) 
       VALUES ($1, $2, $3, 'debit', $4, $5, $6)`,
      [
        req.userId,
        case_id || null,
        caseRate,
        `Download release: ${displayName || service_type}`,
        tooth_numbers?.length || 1,
        JSON.stringify({
          service_type,
          regional_flag: regionalFlag,
          tooth_numbers: tooth_numbers || [],
          source: "ledger-release",
        }),
      ]
    );

    await client.query("COMMIT");

    // Generate unlock token
    const unlockToken = uuidv4();

    res.json({
      success: true,
      unlock_token: unlockToken,
      deducted: caseRate,
      new_balance: newBalance,
      service: displayName || service_type,
      message: "Files authorized for download.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[release] Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
