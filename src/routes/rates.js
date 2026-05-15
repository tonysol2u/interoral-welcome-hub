const express = require("express");
const router = express.Router();
const { pool } = require("../config/db");

/**
 * GET /api/rates?service_type=crown_design
 *
 * Fetches Service_Type and Base_Rate from the sovereign_pricing table.
 * Identifies user's IP to return the correct regional rate.
 */
router.get("/", async (req, res) => {
  try {
    const { service_type } = req.query;
    if (!service_type) {
      return res.status(400).json({ error: "service_type query parameter required" });
    }

    // Resolve user region from IP
    const ip =
      req.headers["cf-connecting-ip"] ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.headers["x-real-ip"] ||
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
    } catch {
      // Default to US
    }

    // Query sovereign_pricing for the user's region
    let result = await pool.query(
      `SELECT * FROM sovereign_pricing 
       WHERE service_type = $1 AND regional_flag = $2 AND is_active = true 
       LIMIT 1`,
      [service_type, regionalFlag]
    );

    // Fallback to US if no regional rate exists
    if (result.rows.length === 0 && regionalFlag !== "US") {
      result = await pool.query(
        `SELECT * FROM sovereign_pricing 
         WHERE service_type = $1 AND regional_flag = 'US' AND is_active = true 
         LIMIT 1`,
        [service_type]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "no_rate_configured",
        message: `No pricing configured for service '${service_type}'`,
        detected_region: regionalFlag,
      });
    }

    const rate = result.rows[0];
    res.json({
      service_type: rate.service_type,
      display_name: rate.display_name,
      base_rate: parseFloat(rate.base_rate),
      currency_symbol: rate.currency_symbol,
      currency_code: rate.currency_code,
      regional_flag: rate.regional_flag,
      detected_region: regionalFlag,
    });
  } catch (err) {
    console.error("[rates] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/rates/all — Admin: fetch all pricing
 */
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM sovereign_pricing ORDER BY sort_order ASC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
