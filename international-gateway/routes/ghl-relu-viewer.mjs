import http from "node:http";

const PORT = Number(process.env.PORT || process.env.GHL_RELU_GATEWAY_PORT || 3000);
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 250 * 1024 * 1024);
const RELU_VIEWER_BASE_URL = process.env.RELU_VIEWER_BASE_URL || "https://automate.relu.ai/viewer/";
const INTERNAL_RELU_PROCESSOR_URL = process.env.INTERNAL_RELU_PROCESSOR_URL || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;

    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error(`Request is larger than ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseJson(buffer) {
  if (!buffer.length) return {};
  return JSON.parse(buffer.toString("utf8"));
}

function getViewerUrl(orderId, viewerUrl) {
  if (viewerUrl) return viewerUrl;
  if (!orderId) return "";

  const url = new URL(RELU_VIEWER_BASE_URL);
  url.searchParams.set("order_id", orderId);
  return url.toString();
}

function normalizeProcessorResponse(raw) {
  const orderId =
    raw?.order_id ||
    raw?.orderId ||
    raw?.relu_order_id ||
    raw?.reluOrderId ||
    raw?.data?.order_id ||
    raw?.data?.orderId;

  const viewerUrl =
    raw?.viewer_url ||
    raw?.viewerUrl ||
    raw?.relu_viewer_url ||
    raw?.data?.viewer_url ||
    raw?.data?.viewerUrl;

  if (!orderId && !viewerUrl) {
    throw new Error("Internal processor did not return order_id or viewer_url");
  }

  return {
    ok: true,
    order_id: orderId || new URL(viewerUrl).searchParams.get("order_id"),
    viewer_url: getViewerUrl(orderId, viewerUrl),
  };
}

async function callInternalProcessor({ contentType, body }) {
  if (!INTERNAL_RELU_PROCESSOR_URL) {
    throw new Error("INTERNAL_RELU_PROCESSOR_URL is not configured");
  }

  const response = await fetch(INTERNAL_RELU_PROCESSOR_URL, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body,
  });

  const text = await response.text();
  let raw;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    raw = { raw: text };
  }

  if (!response.ok) {
    throw new Error(raw?.error || raw?.message || `Internal processor failed with ${response.status}`);
  }

  return normalizeProcessorResponse(raw);
}

async function handleViewerSession(req, res) {
  const contentType = req.headers["content-type"] || "";
  const body = await readBody(req);

  if (contentType.includes("application/json")) {
    const payload = parseJson(body);

    if (payload.action !== "load_from_locker") {
      return sendJson(res, 400, {
        ok: false,
        error: "JSON requests must use action=load_from_locker",
      });
    }

    if (!payload.locker_case_id) {
      return sendJson(res, 400, {
        ok: false,
        error: "locker_case_id is required",
      });
    }

    const result = await callInternalProcessor({
      contentType: "application/json",
      body: JSON.stringify({
        source: payload.source || "ghl",
        action: "load_from_locker",
        locker_case_id: payload.locker_case_id,
      }),
    });

    return sendJson(res, 200, result);
  }

  if (contentType.includes("multipart/form-data")) {
    const result = await callInternalProcessor({
      contentType,
      body,
    });

    return sendJson(res, 200, result);
  }

  return sendJson(res, 415, {
    ok: false,
    error: "Send multipart/form-data for uploads or application/json for locker cases",
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "ghl-relu-viewer-gateway",
        endpoint: "/v1/relu/viewer-session",
        internal_processor_configured: Boolean(INTERNAL_RELU_PROCESSOR_URL),
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/relu/viewer-session") {
      return await handleViewerSession(req, res);
    }

    return sendJson(res, 404, {
      ok: false,
      error: "Not found",
    });
  } catch (error) {
    console.error("[ghl-relu-viewer-gateway]", error);
    return sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`GHL Relu viewer gateway listening on :${PORT}`);
});
