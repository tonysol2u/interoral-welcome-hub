import type { SovereignCaseContext } from "./caseToken";

const DEFAULT_API_BASE = "http://54.146.162.87:3101";

export const sovereignApiBase =
  import.meta.env.VITE_SOVEREIGN_API_BASE || DEFAULT_API_BASE;

export interface ViewerTokenResponse {
  token: string;
  viewerUrl?: string;
  integratorId?: string;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string"
        ? payload.error
        : `Sovereign API failed with ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchCaseContext(caseToken: string): Promise<SovereignCaseContext> {
  const url = new URL("/api/case-context", sovereignApiBase);
  url.searchParams.set("token", caseToken);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  return parseJsonResponse<SovereignCaseContext>(response);
}

export async function fetchReluViewerToken(caseToken: string): Promise<ViewerTokenResponse> {
  const response = await fetch(new URL("/api/relu/iframe-token", sovereignApiBase).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ caseToken }),
  });

  return parseJsonResponse<ViewerTokenResponse>(response);
}

export async function notifyCaseApproved(caseToken: string): Promise<void> {
  const response = await fetch(new URL("/api/relu/approve", sovereignApiBase).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ caseToken }),
  });

  await parseJsonResponse<{ success: true }>(response);
}
