const express = require("express");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3002);
const SHADOW_AGENT_URL = process.env.SHADOW_AGENT_URL || "http://127.0.0.1:3001";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const RELU_API_URL = process.env.RELU_API_URL || "";
const RELU_API_TOKEN = process.env.RELU_API_TOKEN || "";
const RELU_IMPLANT_PLANNING_SERVICE_ID = process.env.RELU_IMPLANT_PLANNING_SERVICE_ID || "";
const RELU_CALLBACK_URL = process.env.RELU_CALLBACK_URL || "";
const SPRING_BOOT_URL = process.env.SPRING_BOOT_URL || "http://127.0.0.1:8080";

const RELU_LEAN_SURGICAL_CONFIG = {
  printer_offset: 0.15,
  guide_thickness: 2.3,
  text_to_print: "engrave_order_name",
  sleeve_printer_offset: 0.1,
  guide_bar: "None",
  glue_holes: "enabled",
};

const app = express();
app.use(express.json({ limit: "25mb" }));

function normalizeTeeth(teeth) {
  if (!Array.isArray(teeth)) return [];
  return teeth.map((tooth) => {
    if (typeof tooth === "number" || typeof tooth === "string") {
      return { number: tooth };
    }
    return tooth;
  });
}

async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `${url} returned ${response.status}`);
  }
  return data;
}

async function patchJson(url, payload) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || data?.message || `${url} returned ${response.status}`);
  }
  return response.json().catch(() => ({}));
}

async function rexIdentifyBrand(material, teeth) {
  const prompt = `You are REX, a dental routing expert.
Material: "${material || ""}"
Teeth: ${JSON.stringify(normalizeTeeth(teeth).map((tooth) => tooth.type || tooth.number) || [])}
Identify the lab destination from the material name:
- Ardent, Argenco, Argen -> return "argen"
- Nobel, Active, Parallel -> return "nobel"
- Straumann, BL, TL, RC -> return "straumann"
- Zirconia, Full Zirconia, Monolithic -> return "china_cbd"
- Relu, digital design, STL design -> return "relu"
- Otherwise -> return "dla_national"
Respond with ONLY the destination string.`;

  try {
    const response = await postJson(`${OLLAMA_URL}/api/generate`, {
      model: "llama3",
      prompt,
      stream: false,
      options: { temperature: 0 },
    });
    const brand = String(response.response || "").trim().toLowerCase();
    if (["argen", "nobel", "straumann", "china_cbd", "relu", "dla_national"].includes(brand)) {
      return brand;
    }
  } catch (error) {
    console.warn("[REX] Ollama brand identification failed:", error.message);
  }

  return fallbackIdentifyBrand(material);
}

function fallbackIdentifyBrand(material = "") {
  const value = material.toLowerCase();
  if (/ardent|argenco|argen/.test(value)) return "argen";
  if (/nobel|active|parallel/.test(value)) return "nobel";
  if (/straumann|bl|tl|rc/.test(value)) return "straumann";
  if (/zirconia|full zirconia|monolithic/.test(value)) return "china_cbd";
  if (/relu|digital design|stl design/.test(value)) return "relu";
  return "dla_national";
}

function reluInputFile(value, extension = ".stl") {
  if (!value) return undefined;
  if (typeof value === "object") return value;
  return {
    external_download_url: String(value),
    extension,
  };
}

async function submitToRelu(payload) {
  if (!RELU_API_URL || !RELU_API_TOKEN || !RELU_IMPLANT_PLANNING_SERVICE_ID) {
    return {
      order_id: `RELU-${payload.de_id || payload.case_id}`,
      status: "pending_relu_credentials",
    };
  }

  const inputData = payload.relu_input_data || payload.input_data || {};
  const reluPayload = {
    service_id: RELU_IMPLANT_PLANNING_SERVICE_ID,
    order_name: payload.de_id || payload.case_id,
    input_data: {
      "Upper Jaw": reluInputFile(inputData["Upper Jaw"] || inputData.upper_jaw || payload.upper_jaw_url || payload.stl_url, ".stl"),
      "Lower Jaw": reluInputFile(inputData["Lower Jaw"] || inputData.lower_jaw || payload.lower_jaw_url, ".stl"),
      "Facial Scan": reluInputFile(inputData["Facial Scan"] || inputData.facial_scan || payload.facial_scan_url, ".obj"),
    },
    output_data: {
      implant_planning: {},
    },
    parameter_values: {
      ...RELU_LEAN_SURGICAL_CONFIG,
      ...(payload.parameter_values || {}),
    },
    callback_url: payload.callback_url || RELU_CALLBACK_URL || null,
    user_id: payload.doctor_id || null,
    is_draft: false,
  };

  const data = await postJson(
    `${RELU_API_URL.replace(/\/$/, "")}/orders`,
    reluPayload,
    {
      "X-API-Key": RELU_API_TOKEN,
      Authorization: `ApiKey ${RELU_API_TOKEN}`,
    },
  );

  return { order_id: data.id || data.order_id || `RELU-${payload.case_id}`, status: "submitted" };
}

async function updateCaseStatus(caseId, status, externalOrderId = null) {
  if (!caseId || !SPRING_BOOT_URL) return;
  try {
    await patchJson(`${SPRING_BOOT_URL.replace(/\/$/, "")}/api/cases/${caseId}/status`, {
      status,
      external_order_id: externalOrderId,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[SPRING] Status update failed:", error.message);
  }
}

async function ensureScrubbed(payload) {
  if (payload.de_id && payload.secure_hash) return payload;

  const patient = payload.patient || {};
  const doctor = payload.doctor || {};
  const scrub = await postJson(`${SHADOW_AGENT_URL}/v1/shadow-agent/process`, {
    patient_last_name: payload.patient_last_name || patient.last_name || patient.lastName,
    patient_dob: payload.patient_dob || patient.dob,
    dentist_first_name: payload.dentist_first_name || doctor.first_name || doctor.firstName,
    office_address: payload.office_address || doctor.office_address || doctor.officeAddress,
    teeth: normalizeTeeth(payload.teeth),
  });

  return {
    ...payload,
    de_id: scrub.de_identified_id,
    secure_hash: scrub.secure_hash,
    compliance_status: scrub.compliance_status,
  };
}

async function routeToDestination(payload) {
  const scrubbed = await ensureScrubbed(payload);
  const brand = scrubbed.brand || await rexIdentifyBrand(scrubbed.material, scrubbed.teeth);

  let result;
  switch (brand) {
    case "relu":
      console.log("[ORCHESTRATOR] -> Relu design API");
      result = await submitToRelu(scrubbed);
      await updateCaseStatus(scrubbed.case_id, "routed_relu", result.order_id);
      break;
    case "nobel":
    case "straumann":
      result = { order_id: `IMPLANT-${scrubbed.de_id || scrubbed.case_id}`, status: "pending_doctor_implant_approval" };
      await updateCaseStatus(scrubbed.case_id, "pending_doctor_implant_approval", result.order_id);
      break;
    case "argen":
    case "china_cbd":
    case "dla_national":
    default:
      result = { order_id: `ROUTE-${brand}-${scrubbed.de_id || scrubbed.case_id}`, status: "assigned_to_lab" };
      await updateCaseStatus(scrubbed.case_id, "assigned_to_lab", result.order_id);
      break;
  }

  console.log(`[ORCHESTRATOR] Case ${scrubbed.case_id || scrubbed.de_id} routed -> ${brand}`);
  return {
    ...result,
    brand,
    de_id: scrubbed.de_id,
    secure_hash: scrubbed.secure_hash,
  };
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "orchestrator", port: PORT });
});

app.post(["/v1/orchestrator/cases", "/v1/cases/route"], async (req, res) => {
  try {
    const result = await routeToDestination(req.body || {});
    res.json({ status: "success", ...result });
  } catch (error) {
    console.error("[ORCHESTRATOR] Routing error:", error);
    res.status(500).json({ status: "error", error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[ORCHESTRATOR] running on port ${PORT}`);
});
