/**
 * Standalone bridge copied from the existing Magic Mirror contract.
 * Protocol: relu-medical-viewer-iframe-api v0.2.0
 */

const RELU_BRIDGE_PROTOCOL = "relu-medical-viewer-iframe-api";
const RELU_BRIDGE_VERSION = "0.2.0";
const RELU_REQUEST_TIMEOUT_MS = 30_000;
const RELU_HANDSHAKE_RETRY_MS = 1_500;

export interface ReluViewerHostOptions {
  integratorId: string;
  branding?: "relu" | "custom";
  container: HTMLElement;
  viewerUrl: string;
  initialConfig?: Record<string, unknown>;
  auth: {
    type: "apiToken";
    token: string;
  };
  onReady?: (api: ReluViewerApi, appInfo: ReluAppInfo) => void;
  onError?: (error: ReluError) => void;
}

export interface ReluAppInfo {
  appId: string;
  engineVersion: string;
  services: { id: string; name: string }[];
}

export interface ReluError {
  code: string;
  message: string;
}

export interface ReluViewerState {
  orderId?: string;
  serviceId?: string;
  status?: string;
  parameters?: Record<string, unknown>;
}

export interface ReluViewerApi {
  save: () => Promise<ReluViewerState>;
  getState: () => Promise<ReluViewerState>;
  updateToken: (token: string) => Promise<void>;
}

export interface ReluViewerHost {
  getApi: () => ReluViewerApi;
  destroy: () => void;
  iframe: HTMLIFrameElement;
}

type ReluBridgeMessage = {
  type: string;
  payload?: unknown;
  messageId?: string;
  timestamp?: number;
  result?: unknown;
  error?: unknown;
};

type ReluBridgeEnvelope = {
  protocol: string;
  version?: string;
  message?: ReluBridgeMessage;
};

type PendingCall = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutId: number;
};

let callCounter = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function prettifyCapability(capability: string) {
  return capability
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function createMessageId() {
  callCounter += 1;
  return `${Date.now()}-${callCounter}`;
}

function wrapBridgeMessage(message: ReluBridgeMessage): ReluBridgeEnvelope {
  return {
    protocol: RELU_BRIDGE_PROTOCOL,
    version: RELU_BRIDGE_VERSION,
    message,
  };
}

function unwrapBridgeMessage(data: unknown): ReluBridgeMessage | null {
  if (!isRecord(data) || data.protocol !== RELU_BRIDGE_PROTOCOL) {
    return null;
  }

  const message = data.message;
  if (!isRecord(message) || typeof message.type !== "string") {
    return null;
  }

  return message as ReluBridgeMessage;
}

function extractBridgeError(payload: unknown, fallbackMessage = "Unknown viewer error"): ReluError {
  const source = isRecord(payload)
    ? (isRecord(payload.error) ? payload.error : payload)
    : null;

  return {
    code: source && typeof source.code === "string" ? source.code : "UNKNOWN",
    message:
      source && typeof source.message === "string"
        ? source.message
        : fallbackMessage,
  };
}

function normalizeViewerState(result: unknown): ReluViewerState {
  if (!isRecord(result)) {
    return {};
  }

  const order = isRecord(result.order) ? result.order : null;
  const parameters: Record<string, unknown> = {};

  if (typeof result.canSave === "boolean") parameters.canSave = result.canSave;
  if (typeof result.hasUnsavedChanges === "boolean") parameters.hasUnsavedChanges = result.hasUnsavedChanges;
  if (result.currentStep !== undefined) parameters.currentStep = result.currentStep;
  if (typeof result.savedAt === "string") parameters.savedAt = result.savedAt;
  if (typeof result.success === "boolean") parameters.success = result.success;
  if (order && typeof order.name === "string") parameters.orderName = order.name;

  const orderIdValue = order?.id;
  const orderId =
    typeof orderIdValue === "string"
      ? orderIdValue
      : typeof orderIdValue === "number"
        ? String(orderIdValue)
        : undefined;

  const status =
    order && typeof order.status === "string"
      ? order.status
      : typeof result.status === "string"
        ? result.status
        : typeof result.success === "boolean"
          ? (result.success ? "success" : "error")
          : undefined;

  return {
    orderId,
    status,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
  };
}

function buildAppInfo(payload: unknown): ReluAppInfo {
  const value = isRecord(payload) ? payload : {};
  const app = isRecord(value.app) ? value.app : {};
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    appId: typeof app.appId === "string" ? app.appId : "relu-automate",
    engineVersion:
      typeof value.viewerVersion === "string"
        ? value.viewerVersion
        : typeof app.version === "string"
          ? app.version
          : "unknown",
    services: capabilities.map((capability) => ({
      id: capability,
      name: prettifyCapability(capability),
    })),
  };
}

function buildViewerConfig(
  initialConfig?: Record<string, unknown>,
  branding?: "relu" | "custom",
) {
  if (!branding) {
    return initialConfig;
  }

  const theme = initialConfig && isRecord(initialConfig.theme)
    ? initialConfig.theme
    : {};

  return {
    ...initialConfig,
    theme: {
      ...theme,
      branding,
    },
  };
}

export function createViewerHost(options: ReluViewerHostOptions): ReluViewerHost {
  const {
    integratorId,
    branding = "relu",
    container,
    viewerUrl,
    initialConfig,
    auth,
    onReady,
    onError,
  } = options;

  const pendingCalls = new Map<string, PendingCall>();
  const viewerOrigin = new URL(viewerUrl).origin;
  const authConfig = {
    auth,
    integratorId,
    hostApiVersion: RELU_BRIDGE_VERSION,
    config: buildViewerConfig(initialConfig, branding),
  };

  let isReady = false;
  let isDestroyed = false;
  let handshakeIntervalId: number | null = null;

  const url = new URL(viewerUrl);
  url.searchParams.set("integrator", integratorId);
  if (branding) url.searchParams.set("branding", branding);

  const iframe = document.createElement("iframe");
  iframe.src = url.toString();
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.style.minHeight = "620px";
  iframe.setAttribute("title", "Relu AI Viewer");
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
  );
  iframe.setAttribute("allow", "accelerometer; gyroscope; webgl; clipboard-write");
  container.appendChild(iframe);

  const clearHandshakeInterval = () => {
    if (handshakeIntervalId !== null) {
      window.clearInterval(handshakeIntervalId);
      handshakeIntervalId = null;
    }
  };

  const postMessage = (message: ReluBridgeMessage) => {
    if (isDestroyed) return;
    iframe.contentWindow?.postMessage(wrapBridgeMessage(message), viewerOrigin);
  };

  const sendEvent = (type: string, payload?: unknown) => {
    postMessage({ type, payload, timestamp: Date.now() });
  };

  const callRemote = (method: string, payload?: unknown): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      if (isDestroyed) {
        reject(new Error("Relu viewer host has been destroyed"));
        return;
      }

      const messageId = createMessageId();
      const timeoutId = window.setTimeout(() => {
        pendingCalls.delete(messageId);
        reject(new Error(`Relu API call '${method}' timed out`));
      }, RELU_REQUEST_TIMEOUT_MS);

      pendingCalls.set(messageId, {
        method,
        resolve,
        reject,
        timeoutId,
      });

      postMessage({
        type: method,
        payload,
        messageId,
        timestamp: Date.now(),
      });
    });
  };

  const sendAuthConfig = () => {
    sendEvent("authConfig", authConfig);
  };

  const startHandshake = () => {
    clearHandshakeInterval();
    sendAuthConfig();

    handshakeIntervalId = window.setInterval(() => {
      if (isReady || isDestroyed) {
        clearHandshakeInterval();
        return;
      }

      sendAuthConfig();
    }, RELU_HANDSHAKE_RETRY_MS);
  };

  const api: ReluViewerApi = {
    save: async () => normalizeViewerState(await callRemote("save")),
    getState: async () => normalizeViewerState(await callRemote("getState")),
    updateToken: async (token: string) => {
      await callRemote("updateToken", { token });
    },
  };

  function handleMessage(event: MessageEvent) {
    if (event.origin !== viewerOrigin) return;

    const message = unwrapBridgeMessage(event.data);
    if (!message) return;

    if (typeof message.messageId === "string" && message.type.endsWith(":response")) {
      const pending = pendingCalls.get(message.messageId);
      if (!pending) return;

      pendingCalls.delete(message.messageId);
      window.clearTimeout(pending.timeoutId);

      if (message.error) {
        pending.reject(
          new Error(
            extractBridgeError(message.error, `Relu API call '${pending.method}' failed`).message,
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    switch (message.type) {
      case "ready": {
        isReady = true;
        clearHandshakeInterval();
        onReady?.(api, buildAppInfo(message.payload));
        break;
      }

      case "error": {
        onError?.(extractBridgeError(message.payload));
        break;
      }

      case "authRequired": {
        void api.updateToken(auth.token).catch((error) => {
          onError?.({
            code: "AUTH_REQUIRED",
            message: error instanceof Error ? error.message : "Relu viewer requested a fresh token",
          });
        });
        break;
      }
    }
  }

  window.addEventListener("message", handleMessage);
  iframe.addEventListener("load", startHandshake);
  startHandshake();

  return {
    getApi: () => api,
    destroy: () => {
      if (isDestroyed) return;

      isDestroyed = true;
      clearHandshakeInterval();
      window.removeEventListener("message", handleMessage);

      pendingCalls.forEach(({ reject, timeoutId }) => {
        window.clearTimeout(timeoutId);
        reject(new Error("Relu viewer host destroyed"));
      });
      pendingCalls.clear();

      iframe.remove();
    },
    iframe,
  };
}
