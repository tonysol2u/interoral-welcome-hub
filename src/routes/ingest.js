const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

/**
 * POST /api/ingest/scan
 *
 * Medit/3Shape scan ingest endpoint.
 * Auto-detects scan source, extracts Tooth# and Material.
 *
 * Body: { file_name, file_size, metadata? }
 */
router.post("/scan", requireAuth, async (req, res) => {
  try {
    const { file_name, file_size, metadata } = req.body;

    if (!file_name) {
      return res.status(400).json({ error: "file_name required" });
    }

    // Detect scan source
    const nameLower = file_name.toLowerCase();
    let source = "unknown";
    if (nameLower.includes("medit") || nameLower.includes("i700") || nameLower.includes("i600")) {
      source = "medit";
    } else if (nameLower.includes("3shape") || nameLower.includes("trios")) {
      source = "3shape";
    }

    // Extract tooth numbers from filename (pattern: T14, T15, etc.)
    const toothPattern = /[Tt](\d{1,2})/g;
    const matches = [...file_name.matchAll(toothPattern)];
    const toothNumbers = matches.map(m => parseInt(m[1])).filter(n => n >= 1 && n <= 32);

    // Extract material
    const materials = ["zirconia", "emax", "e.max", "pfm", "porcelain", "composite", "gold", "titanium", "peek", "pmma"];
    let material = null;
    for (const mat of materials) {
      if (nameLower.includes(mat)) {
        material = mat.charAt(0).toUpperCase() + mat.slice(1);
        break;
      }
    }

    // 3Shape clause check
    const requiresClause = source === "3shape";

    res.json({
      source,
      tooth_numbers: toothNumbers.length > 0 ? toothNumbers : (metadata?.tooth_numbers || []),
      material: material || metadata?.material || null,
      requires_3shape_clause: requiresClause,
      file_name,
      file_size,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
