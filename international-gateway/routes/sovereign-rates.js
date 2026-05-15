const express = require("express");
const router = express.Router();

/**
 * GET /v1/rates?service_type=crown_design
 * Fetches from sovereign_pricing table, resolves by user IP region.
 */
router.get("/", async (req, res) => {
  try {
    const { pool } = require("../db");
    const { service_type } = req.query;
    if (!service_type) return res.status(400).json({ error: "service_type required" });

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "0.0.0.0";

    let regionalFlag = "US";
    try {
      const geoRes = await fetch(`https://ipapi.co/${ip}/country_code/`, { signal: AbortSignal.timeout(3000) });
      if (geoRes.ok) {
        const code = (await geoRes.text()).trim().toUpperCase();
        if (code.length === 2) regionalFlag = code;
      }
    } catch {}

    let result = await pool.query(
      "SELECT * FROM sovereign_pricing WHERE service_type=$1 AND regional_flag=$2 AND is_active=true LIMIT 1",
      [service_type, regionalFlag]
    );

    if (result.rows.length === 0 && regionalFlag !== "US") {
      result = await pool.query(
        "SELECT * FROM sovereign_pricing WHERE service_type=$1 AND regional_flag='US' AND is_active=true LIMIT 1",
        [service_type]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "no_rate_configured", detected_region: regionalFlag });
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
    res.status(500).json({ error: err.message });
  }
});

router.get("/all", async (req, res) => {
  try {
    const { pool } = require("../db");
    const result = await pool.query("SELECT * FROM sovereign_pricing ORDER BY sort_order ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
