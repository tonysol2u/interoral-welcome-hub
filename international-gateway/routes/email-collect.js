const express = require("express");
const router = express.Router();

/**
 * POST /v1/emails/collect
 * Stores user emails from the Relu download flow.
 * Direct path: Medit → Relu → Backend → email collected at download/unlock.
 *
 * Body: { email, source?, name?, doctor_id? }
 */
router.post("/collect", async (req, res) => {
  try {
    const { pool } = require("../db");
    const { email, source, name, doctor_id } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }

    await pool.query(
      `INSERT INTO collected_emails (email, source, name, doctor_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         last_seen = NOW(),
         source = COALESCE(EXCLUDED.source, collected_emails.source)`,
      [email.toLowerCase().trim(), source || "relu_download", name || null, doctor_id || null]
    );

    res.json({ success: true, message: "Email collected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /v1/emails/list — Admin: view all collected emails
 */
router.get("/list", async (req, res) => {
  try {
    const { pool } = require("../db");
    const result = await pool.query(
      "SELECT * FROM collected_emails ORDER BY created_at DESC LIMIT 500"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
