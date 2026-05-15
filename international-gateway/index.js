/**
 * INTERORAL GROUP 1 INTERNATIONAL GATEWAY
 * Medit -> Shadow Agent -> S3 -> Orchestrator -> Relu/Lab
 */
const express = require("express");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const PORT = Number(process.env.PORT || 3000);
const SHADOW_AGENT_URL = process.env.SHADOW_AGENT_URL || "http://127.0.0.1:3001";
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://127.0.0.1:3002";
const RELU_VIEWER_URL = process.env.RELU_VIEWER_URL || "https://automate.relu.ai";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_PREFIX = (process.env.S3_PREFIX || "medit").replace(/^\/+|\/+$/g, "");
const MEDIT_WEBHOOK_SECRET = process.env.MEDIT_WEBHOOK_SECRET || "";
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, "public");

const app = express();
app.use(express.json({ limit: "25mb" }));

// GHL/S3-friendly API responses without adding another dependency.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, x-medit-signature");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const s3 = S3_BUCKET ? new S3Client({ region: AWS_REGION }) : null;

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || undefined;
}

function asString(value, fallback = "") {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeTeeth(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "number") return [value];
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,\s]+/).filter(Boolean);
  }
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

/**
 * Group 2 blueprint De-ID format:
 * [PatientLast3][PatientBirthYY]-[CaseYear]-[DentistFirst3][DentistAddr3]-[ToothSeq]
 */
function generateDeIdString(patientLastName, patientDob, dentistFirstName, officeAddress, teeth) {
  const patientLast3 = asString(patientLastName, "XXX").substring(0, 3).toUpperCase();
  const birthYY = birthYearYY(patientDob);
  const caseYear = new Date().getFullYear().toString().slice(-2);
  const dentistFirst3 = asString(dentistFirstName, "XXX").substring(0, 3).toUpperCase();
  const addrDigits = (asString(officeAddress, "000").replace(/\D/g, "").substring(0, 3) || "000");
  const toothSeq = normalizeTeeth(teeth).map(toothValue).join("") || "00";
  return `${patientLast3}${birthYY}-${caseYear}-${dentistFirst3}${addrDigits}-${toothSeq}`;
}

function verifyMeditSignature(req) {
  if (!MEDIT_WEBHOOK_SECRET) return true;
  const signature = asString(req.get("x-medit-signature"));
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", MEDIT_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body || {}))
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function buildMeditCase(payload) {
  const patient = payload.patient || payload.patient_info || {};
  const doctor = payload.doctor || payload.dentist || payload.clinic || {};
  const scan = payload.scan || payload.file || payload.files || {};
  const teeth = normalizeTeeth(pickFirst(payload.teeth, payload.tooth_numbers, payload.toothNumber, scan.teeth));

  const normalized = {
    case_id: asString(pickFirst(payload.case_id, payload.caseId, payload.id, payload.order_id), `medit-${Date.now()}`),
    source_case_id: pickFirst(payload.case_id, payload.caseId, payload.id, payload.order_id),
    patient_last_name: asString(pickFirst(payload.patient_last_name, patient.last_name, patient.lastName, patient.family_name), "XXX"),
    patient_dob: asString(pickFirst(payload.patient_dob, patient.dob, patient.date_of_birth), "0000"),
    dentist_first_name: asString(pickFirst(payload.dentist_first_name, doctor.first_name, doctor.firstName, doctor.name), "XXX"),
    office_address: asString(pickFirst(payload.office_address, doctor.office_address, doctor.address, payload.practice_address), "000"),
    doctor_id: asString(pickFirst(payload.doctor_id, doctor.id, payload.dentist_id), "unknown"),
    material: asString(pickFirst(payload.material, payload.materialName, scan.material), "digital design"),
    shade: asString(pickFirst(payload.shade, scan.shade), ""),
    teeth,
    stl_url: pickFirst(payload.stl_url, payload.stlUrl, payload.scan_url, scan.url),
    stl_s3_key: pickFirst(payload.stl_s3_key, payload.stlS3Key, payload.s3_key, scan.s3_key),
    relu_input_data: {
      "Upper Jaw": pickFirst(payload.upper_jaw, payload.upperJaw, payload.upper_jaw_url, payload.upperJawUrl, payload.input_data?.["Upper Jaw"]),
      "Lower Jaw": pickFirst(payload.lower_jaw, payload.lowerJaw, payload.lower_jaw_url, payload.lowerJawUrl, payload.input_data?.["Lower Jaw"]),
      "Facial Scan": pickFirst(payload.facial_scan, payload.facialScan, payload.facial_scan_url, payload.facialScanUrl, payload.input_data?.["Facial Scan"]),
    },
  };

  normalized.local_de_id = generateDeIdString(
    normalized.patient_last_name,
    normalized.patient_dob,
    normalized.dentist_first_name,
    normalized.office_address,
    normalized.teeth,
  );

  return normalized;
}

async function postJson(url, body, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || payload?.message || `${url} returned ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function callShadowAgent(casePayload) {
  return postJson(`${SHADOW_AGENT_URL}/v1/shadow-agent/process`, {
    patient_last_name: casePayload.patient_last_name,
    patient_dob: casePayload.patient_dob,
    dentist_first_name: casePayload.dentist_first_name,
    office_address: casePayload.office_address,
    teeth: casePayload.teeth,
  });
}

function buildScrubbedPayload(rawCase, shadowResult) {
  const deId = shadowResult.de_identified_id || shadowResult.de_id || rawCase.local_de_id;
  return {
    case_id: rawCase.case_id,
    source_case_id: rawCase.source_case_id,
    de_id: deId,
    de_identified_id: deId,
    local_de_id: rawCase.local_de_id,
    secure_hash: shadowResult.secure_hash,
    request_id: shadowResult.request_id,
    compliance_status: shadowResult.compliance_status || "scrubbed_by_shadow_agent",
    material: rawCase.material,
    shade: rawCase.shade,
    teeth: rawCase.teeth,
    stl_url: rawCase.stl_url,
    stl_s3_key: rawCase.stl_s3_key,
    relu_input_data: rawCase.relu_input_data,
    doctor_id: rawCase.doctor_id,
    source: "medit",
    received_at: new Date().toISOString(),
  };
}

async function uploadScrubbedPayload(payload) {
  if (!s3) return null;
  const safeId = String(payload.de_id || payload.case_id).replace(/[^A-Za-z0-9_.-]/g, "_");
  const key = `${S3_PREFIX}/${safeId}/${Date.now()}-scrubbed.json`;
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: JSON.stringify(payload, null, 2),
    ContentType: "application/json",
    ServerSideEncryption: "AES256",
  }));
  return key;
}

async function triggerOrchestrator(payload) {
  return postJson(`${ORCHESTRATOR_URL}/v1/orchestrator/cases`, payload, 45000);
}

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "international-gateway",
    port: PORT,
    shadow_agent_url: SHADOW_AGENT_URL,
    orchestrator_url: ORCHESTRATOR_URL,
    s3_enabled: Boolean(S3_BUCKET),
  });
});

app.use(express.static(STATIC_DIR));

app.post("/v1/relu/token", (req, res) => {
  const token = process.env.RELU_IFRAME_TOKEN || process.env.RELU_API_TOKEN;
  if (!token) return res.status(503).json({ error: "Relu token is not configured" });
  res.json({ token, viewerUrl: RELU_VIEWER_URL });
});

app.post("/v1/medit/webhook", async (req, res) => {
  if (!verifyMeditSignature(req)) {
    return res.status(401).json({ status: "error", error: "Invalid Medit webhook signature" });
  }

  const rawCase = buildMeditCase(req.body || {});
  console.log(`[GATEWAY] Medit case received: ${rawCase.case_id} -> local DeID ${rawCase.local_de_id}`);

  try {
    const shadowResult = await callShadowAgent(rawCase);
    if (!shadowResult.secure_hash) throw new Error("Shadow Agent did not return secure_hash");

    const scrubbedPayload = buildScrubbedPayload(rawCase, shadowResult);
    const s3Key = await uploadScrubbedPayload(scrubbedPayload);
    const orchestratorPayload = { ...scrubbedPayload, s3_key: s3Key };

    try {
      const orchestrator = await triggerOrchestrator(orchestratorPayload);
      return res.json({
        status: "submitted",
        case_id: rawCase.case_id,
        de_identified_id: scrubbedPayload.de_identified_id,
        secure_hash: scrubbedPayload.secure_hash,
        s3_key: s3Key,
        orchestrator,
      });
    } catch (error) {
      console.error(`[GATEWAY] Orchestrator unavailable for ${rawCase.case_id}: ${error.message}`);
      return res.status(202).json({
        status: "scrubbed_pending_orchestrator",
        case_id: rawCase.case_id,
        de_identified_id: scrubbedPayload.de_identified_id,
        secure_hash: scrubbedPayload.secure_hash,
        s3_key: s3Key,
        orchestrator_error: error.message,
      });
    }
  } catch (error) {
    console.error(`[GATEWAY] Medit case failed: ${error.message}`);
    return res.status(500).json({ status: "error", case_id: rawCase.case_id, error: error.message });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/v1/")) return next();
  res.sendFile(path.join(STATIC_DIR, "index.html"), (error) => {
    if (error) next();
  });
});

// ====================== RELU VIEWER SESSION ======================
app.post('/v1/relu/viewer-session', (req, res) => {
  try {
    res.json({
      ok: true,
      order_id: "demo-" + Date.now(),
      viewer_url: "https://automate.relu.ai/viewer/?order_id=demo-" + Date.now(),
      message: "Relu MagicMirror session ready"
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ====================== MASTER CREDITS ROUTES ======================
app.post('/v1/mastercredits/balance', async (req, res) => {
  try {
    const { doctor_id, currency = "USD" } = req.body;
    res.json({
      ok: true,
      doctor_id,
      balance: 250,
      currency,
      message: "Balance retrieved successfully"
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/v1/mastercredits/deduct', async (req, res) => {
  try {
    const { case_id, order_id, doctor_id, credits = 10, reason = "mastercron_print_unlock" } = req.body;

    const unlockCost = parseInt(process.env.MASTER_CREDITS_UNLOCK_COST) || 10;

    if (credits < unlockCost) {
      return res.status(400).json({ ok: false, error: "Insufficient credits" });
    }

    const unlockToken = require('crypto').randomBytes(32).toString('hex');

    res.json({
      ok: true,
      doctor_id,
      credits_deducted: credits,
      remaining_balance: 240,
      unlock_token: unlockToken,
      message: "Payment successful - unlock token issued"
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ====================== SOVEREIGN PRICING + LEDGER ROUTES ======================
app.use("/v1/rates", require("./routes/sovereign-rates"));
app.use("/v1/release", require("./routes/ledger-release"));
app.use("/v1/ghl", require("./routes/ghl-signal"));
app.use("/v1/webhooks/stripe", require("./routes/stripe-webhook"));
app.use("/v1/emails", require("./routes/email-collect"));

// ====================== START SERVER ======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[GATEWAY] International Gateway listening on ${PORT}`);
});
