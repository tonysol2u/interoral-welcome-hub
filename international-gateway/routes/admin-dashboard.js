const express = require("express");
const router = express.Router();

/**
 * Admin Dashboard API Routes
 * All queries default to regional_flag = 'US'
 */

// GET /v1/admin/context — Auth gate / "am I admin?"
router.get("/context", async (req, res) => {
  const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS || "ts.interdental@gmail.com,hq@interoral.ai").split(",");
  const email = req.headers["x-user-email"] || "";
  res.json({
    isSuperAdmin: SUPERADMIN_EMAILS.includes(email.toLowerCase()),
    email: email || null,
  });
});

// GET /v1/admin/dashboard-kpis?range=week|month
router.get("/dashboard-kpis", async (req, res) => {
  try {
    const { pool } = require("../db");
    const range = req.query.range === "month" ? "30 days" : "7 days";

    const [doctors, revenue, orders, mc] = await Promise.all([
      pool.query("SELECT COUNT(DISTINCT user_id) as total FROM design_token_balances"),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM design_token_ledger WHERE direction='debit' AND created_at > NOW() - INTERVAL '${range}'`),
      pool.query(`SELECT COUNT(*) as total FROM design_token_ledger WHERE direction='debit' AND created_at > NOW() - INTERVAL '${range}'`),
      pool.query("SELECT COALESCE(SUM(balance),0) as circulating FROM design_token_balances"),
    ]);

    const newDoctors = await pool.query(`SELECT COUNT(DISTINCT user_id) as total FROM design_token_balances WHERE created_at > NOW() - INTERVAL '${range}'`);

    res.json({
      doctors_total: parseInt(doctors.rows[0]?.total || 0),
      doctors_new: parseInt(newDoctors.rows[0]?.total || 0),
      revenue_usd: parseFloat(revenue.rows[0]?.total || 0),
      orders: parseInt(orders.rows[0]?.total || 0),
      mc_circulating: parseFloat(mc.rows[0]?.circulating || 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/admin/crown-doctors?range=week|month
router.get("/crown-doctors", async (req, res) => {
  try {
    const { pool } = require("../db");
    const range = req.query.range === "month" ? "30 days" : "7 days";

    const result = await pool.query(`
      SELECT 
        user_id,
        COALESCE(SUM(amount),0) as usd_spent,
        COUNT(*) FILTER (WHERE metadata->>'service_type' = 'mastercrown_anterior') as crowns,
        COUNT(*) FILTER (WHERE metadata->>'service_type' LIKE '%coping%') as copings,
        COUNT(*) FILTER (WHERE metadata->>'service_type' LIKE '%bridge%') as bridges,
        MAX(created_at) as last_order_at
      FROM design_token_ledger
      WHERE direction = 'debit' AND created_at > NOW() - INTERVAL '${range}'
      GROUP BY user_id
      ORDER BY usd_spent DESC
      LIMIT 50
    `);

    res.json(result.rows.map(r => ({
      user_id: r.user_id,
      name: "",
      email: "",
      state: "US",
      usd_spent: parseFloat(r.usd_spent),
      crowns: parseInt(r.crowns),
      copings: parseInt(r.copings),
      bridges: parseInt(r.bridges),
      last_order_at: r.last_order_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/admin/crown-product-mix?range=week|month
router.get("/crown-product-mix", async (req, res) => {
  try {
    const { pool } = require("../db");
    const range = req.query.range === "month" ? "30 days" : "7 days";

    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE metadata->>'service_type' = 'mastercrown_anterior') as crowns,
        COUNT(*) FILTER (WHERE metadata->>'service_type' LIKE '%coping%') as copings,
        COUNT(*) FILTER (WHERE metadata->>'service_type' LIKE '%bridge%') as bridges,
        COALESCE(SUM(amount) FILTER (WHERE metadata->>'service_type' = 'mastercrown_anterior'),0) as crowns_usd,
        COALESCE(SUM(amount) FILTER (WHERE metadata->>'service_type' LIKE '%coping%'),0) as copings_usd,
        COALESCE(SUM(amount) FILTER (WHERE metadata->>'service_type' LIKE '%bridge%'),0) as bridges_usd
      FROM design_token_ledger
      WHERE direction = 'debit' AND created_at > NOW() - INTERVAL '${range}'
    `);

    const r = result.rows[0] || {};
    res.json({
      crowns: parseInt(r.crowns || 0),
      copings: parseInt(r.copings || 0),
      bridges: parseInt(r.bridges || 0),
      usd_each: {
        crowns: parseFloat(r.crowns_usd || 0),
        copings: parseFloat(r.copings_usd || 0),
        bridges: parseFloat(r.bridges_usd || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/admin/coin-summary?range=week|month
router.get("/coin-summary", async (req, res) => {
  try {
    const { pool } = require("../db");
    const range = req.query.range === "month" ? "30 days" : "7 days";

    const [credits, debits, holders, txns] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM design_token_ledger WHERE direction='credit' AND created_at > NOW() - INTERVAL '${range}'`),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total FROM design_token_ledger WHERE direction='debit' AND created_at > NOW() - INTERVAL '${range}'`),
      pool.query("SELECT COUNT(*) as total FROM design_token_balances WHERE balance > 0"),
      pool.query(`SELECT * FROM design_token_ledger WHERE created_at > NOW() - INTERVAL '${range}' ORDER BY created_at DESC LIMIT 20`),
    ]);

    res.json({
      total_credited: parseFloat(credits.rows[0]?.total || 0),
      total_spent: parseFloat(debits.rows[0]?.total || 0),
      holders: parseInt(holders.rows[0]?.total || 0),
      transactions: txns.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/admin/stl-by-country?range=week|month
router.get("/stl-by-country", async (req, res) => {
  try {
    const { pool } = require("../db");
    const range = req.query.range === "month" ? "30 days" : "7 days";

    const result = await pool.query(`
      SELECT 
        COALESCE(metadata->>'regional_flag', 'US') as country,
        COUNT(*) as orders,
        COALESCE(SUM(amount),0) as usd_total
      FROM design_token_ledger
      WHERE direction = 'debit' AND created_at > NOW() - INTERVAL '${range}'
      GROUP BY metadata->>'regional_flag'
      ORDER BY usd_total DESC
    `);

    res.json(result.rows.map(r => ({
      country: r.country || "US",
      flag: r.country || "US",
      orders: parseInt(r.orders),
      usd_total: parseFloat(r.usd_total),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/admin/stl-doctors?range=week|month
router.get("/stl-doctors", async (req, res) => {
  try {
    const { pool } = require("../db");
    const range = req.query.range === "month" ? "30 days" : "7 days";

    const result = await pool.query(`
      SELECT 
        user_id,
        COALESCE(metadata->>'regional_flag', 'US') as country,
        COALESCE(SUM(amount),0) as usd_spent,
        MAX(created_at) as last_order_at
      FROM design_token_ledger
      WHERE direction = 'debit' AND created_at > NOW() - INTERVAL '${range}'
      GROUP BY user_id, metadata->>'regional_flag'
      ORDER BY usd_spent DESC
      LIMIT 50
    `);

    res.json(result.rows.map(r => ({
      user_id: r.user_id,
      name: "",
      email: "",
      country: r.country || "US",
      usd_spent: parseFloat(r.usd_spent),
      last_order_at: r.last_order_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /v1/admin/user-price-override — Set custom pricing per user
router.post("/user-price-override", async (req, res) => {
  try {
    const { pool } = require("../db");
    const { user_id, service_type, custom_rate, note } = req.body;

    if (!user_id || !service_type || custom_rate == null) {
      return res.status(400).json({ error: "user_id, service_type, and custom_rate required" });
    }

    await pool.query(`
      INSERT INTO user_price_overrides (user_id, service_type, custom_rate, note)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, service_type) DO UPDATE SET custom_rate = $3, note = $4
    `, [user_id, service_type, custom_rate, note || null]);

    res.json({ success: true, message: `Custom rate $${custom_rate} set for user ${user_id}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/admin/user-price-overrides — List all custom overrides
router.get("/user-price-overrides", async (req, res) => {
  try {
    const { pool } = require("../db");
    const result = await pool.query("SELECT * FROM user_price_overrides ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
