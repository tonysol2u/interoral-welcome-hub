const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3001);
const SHADOW_AGENT_SALT = process.env.SHADOW_AGENT_SALT || "rotate-this-shadow-salt";

const app = express();
app.use(express.json({ limit: "10mb" }));

function asString(value, fallback = "") {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeTeeth(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "number") return [value];
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function toothValue(tooth) {
  if (typeof tooth === "number" || typeof tooth === "string") return String(tooth);
  if (tooth && typeof tooth === "object") {
    return String(tooth.number || tooth.toothNumber || tooth.tooth || tooth.id || "");
  }
  return "";
}

function birthYearYY(patientDob) {
  const value = asString(patientDob, "0000");
  const yearMatch = value.match(/\d{4}/);
  if (yearMatch) return yearMatch[0].slice(2, 4);
  const digits = value.replace(/\D/g, "");
  return digits.length >= 2 ? digits.slice(-2) : "00";
}

function generateDeIdString(patientLastName, patientDob, dentistFirstName, officeAddress, teeth) {
  const patientLast3 = asString(patientLastName, "XXX").substring(0, 3).toUpperCase();
  const birthYY = birthYearYY(patientDob);
  const caseYear = new Date().getFullYear().toString().slice(-2);
  const dentistFirst3 = asString(dentistFirstName, "XXX").substring(0, 3).toUpperCase();
  const addrDigits = asString(officeAddress, "000").replace(/\D/g, "").substring(0, 3) || "000";
  const toothSeq = normalizeTeeth(teeth).map(toothValue).join("") || "00";
  return `${patientLast3}${birthYY}-${caseYear}-${dentistFirst3}${addrDigits}-${toothSeq}`;
}

function generateSecureHash(deIdString) {
  return crypto.createHash("sha256").update(`${deIdString}|${SHADOW_AGENT_SALT}`).digest("hex");
}

app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "shadow-agent", active_salts: SHADOW_AGENT_SALT ? 1 : 0 });
});

app.post("/v1/shadow-agent/process", (req, res) => {
  const startTime = Date.now();
  const {
    patient_last_name,
    patient_dob,
    dentist_first_name,
    office_address,
    teeth,
  } = req.body || {};

  if (!patient_last_name || !dentist_first_name) {
    return res.status(400).json({
      status: "error",
      error: "Missing required fields",
      required: ["patient_last_name", "dentist_first_name"],
    });
  }

  const requestId = crypto.randomUUID();
  const deIdentifiedId = generateDeIdString(
    patient_last_name,
    patient_dob,
    dentist_first_name,
    office_address,
    teeth,
  );
  const secureHash = generateSecureHash(deIdentifiedId);

  res.json({
    status: "success",
    request_id: requestId,
    de_identified_id: deIdentifiedId,
    secure_hash: secureHash,
    processing_time_ms: Date.now() - startTime,
    compliance_status: "scrubbed_by_shadow_agent",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[SHADOW] Shadow Agent running on ${PORT}`);
});
