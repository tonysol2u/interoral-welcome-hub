const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || "";

/**
 * POST /api/ghl/case-signal
 *
 * Fires GHL webhook ONLY AFTER database confirms the case
 * has been successfully logged (debit entry exists in ledger).
 *
 * Body: { case_id, service_type, tooth_numbers, pathway }
 */
router.post("/case-signal", requireAuth, async (req, res) => {
  try {
    const { case_id, service_type, tooth_numbers, pathway } = req.body;

    // Verify case is confirmed in ledger
    const ledgerCheck = await pool.query(
      `SELECT id, created_at FROM design_token_ledger 
       WHERE case_id = $1 AND direction = 'debit' LIMIT 1`,
      [case_id]
    );

    if (ledgerCheck.rows.length === 0) {
      return res.status(409).json({
        error: "case_not_confirmed",
        message: "Cannot fire GHL signal: case not yet confirmed in ledger.",
      });
    }

    // Build GHL payload
    const ghlPayload = {
      event: "case_submitted",
      contact_email: req.userEmail,
      case_id,
      service_type: service_type || "crown_design",
      tooth_numbers: (tooth_numbers || []).join(", "),
      pathway: pathway || "design",
      submitted_at: new Date().toISOString(),
      confirmed_at: ledgerCheck.rows[0].created_at,
      message: `Your case #${case_id} is now being processed by the Lobe. You will receive your files shortly.`,
    };

    // Log the attempt
    const logResult = await pool.query(
      `INSERT INTO ghl_webhook_log (user_id, case_id, event_type, payload, status) 
       VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
      [req.userId, case_id, "case_submitted", JSON.stringify(ghlPayload)]
    );
    const logId = logResult.rows[0]?.id;

    // Fire webhook
    if (!GHL_WEBHOOK_URL) {
      if (logId) {
        await pool.query("UPDATE ghl_webhook_log SET status = 'skipped' WHERE id = $1", [logId]);
      }
      return res.json({ success: true, ghl_sent: false, reason: "GHL_WEBHOOK_URL not configured" });
    }

    const ghlRes = await fetch(GHL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ghlPayload),
      signal: AbortSignal.timeout(10000),
    });

    // Update log
    if (logId) {
      await pool.query(
        "UPDATE ghl_webhook_log SET status = $1, response_code = $2 WHERE id = $3",
        [ghlRes.ok ? "sent" : "failed", ghlRes.status, logId]
      );
    }

    res.json({ success: true, ghl_sent: ghlRes.ok, ghl_status: ghlRes.status });
  } catch (err) {
    console.error("[ghl] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
