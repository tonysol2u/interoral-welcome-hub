const express = require("express");
const router = express.Router();

const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || "";

/**
 * POST /v1/ghl/case-signal
 * Fires GHL webhook ONLY after ledger confirms debit exists for this case.
 * Body: { user_id, user_email, case_id, service_type, tooth_numbers, pathway }
 */
router.post("/case-signal", async (req, res) => {
  try {
    const { pool } = require("../db");
    const { user_id, user_email, case_id, service_type, tooth_numbers, pathway } = req.body;

    const check = await pool.query(
      "SELECT id, created_at FROM design_token_ledger WHERE case_id=$1 AND direction='debit' LIMIT 1",
      [case_id]
    );

    if (check.rows.length === 0) {
      return res.status(409).json({ error: "case_not_confirmed", message: "Case not yet in ledger." });
    }

    const ghlPayload = {
      event: "case_submitted",
      contact_email: user_email || "",
      case_id,
      service_type: service_type || "crown_design",
      tooth_numbers: (tooth_numbers || []).join(", "),
      pathway: pathway || "design",
      submitted_at: new Date().toISOString(),
      confirmed_at: check.rows[0].created_at,
      message: `Your case #${case_id} is now being processed by the Lobe.`,
    };

    await pool.query(
      "INSERT INTO ghl_webhook_log (user_id, case_id, event_type, payload, status) VALUES ($1,$2,$3,$4,'pending')",
      [user_id, case_id, "case_submitted", JSON.stringify(ghlPayload)]
    );

    if (!GHL_WEBHOOK_URL) {
      return res.json({ success: true, ghl_sent: false, reason: "GHL_WEBHOOK_URL not set" });
    }

    const ghlRes = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ghlPayload),
      signal: AbortSignal.timeout(10000),
    });

    await pool.query(
      "UPDATE ghl_webhook_log SET status=$1, response_code=$2 WHERE case_id=$3 AND event_type='case_submitted'",
      [ghlRes.ok ? "sent" : "failed", ghlRes.status, case_id]
    );

    res.json({ success: true, ghl_sent: ghlRes.ok, ghl_status: ghlRes.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
