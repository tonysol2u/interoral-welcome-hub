export type FixedDoorId = "medit-relu" | "three-shape-mastercrown" | "direct-interoral" | "lab-master-router";

export interface SovereignCaseContext {
  route: FixedDoorId;
  caseId: string;
  hashedId: string;
  doctorLabel?: string;
  clinicLabel?: string;
  scanner?: "medit" | "3shape" | "direct" | "lab";
  reluOrderId?: string;
  viewerUrl?: string;
  issuedAt?: string;
  expiresAt?: string;
}

export interface LocalCaseContext extends SovereignCaseContext {
  token?: string;
  source: "gateway" | "url" | "empty";
}

const DEFAULT_CONTEXT: LocalCaseContext = {
  route: "medit-relu",
  caseId: "",
  hashedId: "",
  scanner: "medit",
  source: "empty",
};

export function readCaseToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("caseToken") || params.get("token");
}

export function readUrlFallbackContext(): LocalCaseContext {
  const params = new URLSearchParams(window.location.search);
  const caseId = params.get("caseId") || params.get("case") || "";
  const hashedId = params.get("hashedId") || params.get("hash") || "";
  const reluOrderId = params.get("reluOrderId") || params.get("order") || undefined;
  const viewerUrl = params.get("viewerUrl") || undefined;

  if (!caseId && !hashedId && !reluOrderId) {
    return DEFAULT_CONTEXT;
  }

  return {
    route: "medit-relu",
    caseId,
    hashedId,
    scanner: "medit",
    reluOrderId,
    viewerUrl,
    token: readCaseToken() || undefined,
    source: "url",
  };
}
