import { getAntigravityHeaders, ANTIGRAVITY_ENDPOINT_PROD, ANTIGRAVITY_DEFAULT_PROJECT_ID } from "../core/src/constants";
import { parseRefreshParts, formatRefreshParts } from "../core/src/plugin/auth";
import { refreshAccessToken, AntigravityTokenRefreshError } from "../core/src/plugin/token";
import type { PluginClient } from "../core/src/plugin/types";

// --- Inlined helpers (from opencode-antigravity-auth/src/plugin.ts, not in core submodule) ---

function decodeEscapedText(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function normalizeGoogleVerificationUrl(rawUrl: string): string | undefined {
  const normalized = decodeEscapedText(rawUrl).trim();
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname !== "accounts.google.com") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function selectBestVerificationUrl(urls: string[]): string | undefined {
  const unique = Array.from(new Set(urls.map((url) => normalizeGoogleVerificationUrl(url)).filter(Boolean) as string[]));
  if (unique.length === 0) return undefined;
  unique.sort((a, b) => {
    const score = (value: string): number => {
      let total = 0;
      if (value.includes("plt=")) total += 4;
      if (value.includes("/signin/continue")) total += 3;
      if (value.includes("continue=")) total += 2;
      if (value.includes("service=cloudcode")) total += 1;
      return total;
    };
    return score(b) - score(a);
  });
  return unique[0];
}

function extractVerificationErrorDetails(bodyText: string): {
  validationRequired: boolean;
  message?: string;
  verifyUrl?: string;
} {
  const decodedBody = decodeEscapedText(bodyText);
  const lowerBody = decodedBody.toLowerCase();
  let validationRequired = lowerBody.includes("validation_required");
  let message: string | undefined;
  const verificationUrls = new Set<string>();

  const collectUrlsFromText = (text: string): void => {
    for (const match of text.matchAll(/https:\/\/accounts\.google\.com\/[^\s"'<>]+/gi)) {
      if (match[0]) verificationUrls.add(match[0]);
    }
  };

  collectUrlsFromText(decodedBody);

  const payloads: unknown[] = [];
  const trimmed = decodedBody.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { payloads.push(JSON.parse(trimmed)); } catch {}
  }

  for (const rawLine of decodedBody.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const payloadText = line.slice(5).trim();
    if (!payloadText || payloadText === "[DONE]") continue;
    try { payloads.push(JSON.parse(payloadText)); } catch { collectUrlsFromText(payloadText); }
  }

  const visited = new Set<unknown>();
  const walk = (value: unknown, key?: string): void => {
    if (typeof value === "string") {
      const normalizedValue = decodeEscapedText(value);
      const lowerValue = normalizedValue.toLowerCase();
      const lowerKey = key?.toLowerCase() ?? "";
      if (lowerValue.includes("validation_required")) validationRequired = true;
      if (!message && (lowerKey.includes("message") || lowerKey.includes("detail") || lowerKey.includes("description"))) {
        message = normalizedValue;
      }
      if (lowerKey.includes("validation_url") || lowerKey.includes("verify_url") || lowerKey.includes("verification_url") || lowerKey === "url") {
        verificationUrls.add(normalizedValue);
      }
      collectUrlsFromText(normalizedValue);
      return;
    }
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) { for (const item of value) walk(item); return; }
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      walk(childValue, childKey);
    }
  };

  for (const payload of payloads) walk(payload);

  if (!validationRequired) {
    validationRequired =
      lowerBody.includes("verification required") ||
      lowerBody.includes("verify your account") ||
      lowerBody.includes("account verification");
  }

  if (!message) {
    const fallback = decodedBody
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("data:") && /(verify|validation|required)/i.test(line));
    if (fallback) message = fallback;
  }

  return {
    validationRequired,
    message,
    verifyUrl: selectBestVerificationUrl([...verificationUrls]),
  };
}

// --- End inlined helpers ---

export interface VerificationProbeResult {
  status: "ok" | "blocked" | "error";
  message: string;
  verifyUrl?: string;
}

export async function verifyAccountAccess(
  account: {
    refreshToken: string;
    email?: string;
    projectId?: string;
    managedProjectId?: string;
    verificationUrl?: string;
  },
  client: PluginClient,
  providerId: string,
): Promise<VerificationProbeResult> {
  const parsed = parseRefreshParts(account.refreshToken);
  if (!parsed.refreshToken) {
    return { status: "error", message: "Missing refresh token for selected account." };
  }

  const auth = {
    type: "oauth" as const,
    refresh: formatRefreshParts({
      refreshToken: parsed.refreshToken,
      projectId: parsed.projectId ?? account.projectId,
      managedProjectId: parsed.managedProjectId ?? account.managedProjectId,
    }),
    access: "",
    expires: 0,
  };

  let refreshedAuth: Awaited<ReturnType<typeof refreshAccessToken>>;
  try {
    refreshedAuth = await refreshAccessToken(auth, client, providerId);
  } catch (error) {
    if (error instanceof AntigravityTokenRefreshError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: `Token refresh failed: ${String(error)}` };
  }

  if (!refreshedAuth?.access) {
    return { status: "error", message: "Could not refresh access token for this account." };
  }

  const projectId =
    parsed.managedProjectId ??
    parsed.projectId ??
    account.managedProjectId ??
    account.projectId ??
    ANTIGRAVITY_DEFAULT_PROJECT_ID;

  const headers: Record<string, string> = {
    ...getAntigravityHeaders(),
    Authorization: `Bearer ${refreshedAuth.access}`,
    "Content-Type": "application/json",
  };
  if (projectId) {
    headers["x-goog-user-project"] = projectId;
  }

  const requestBody = {
    model: "gemini-3-flash",
    request: {
      model: "gemini-3-flash",
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      generationConfig: { maxOutputTokens: 1, temperature: 0 },
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  let response: Response;
  try {
    response = await fetch(`${ANTIGRAVITY_ENDPOINT_PROD}/v1internal:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "error", message: "Verification check timed out." };
    }
    return { status: "error", message: `Verification check failed: ${String(error)}` };
  } finally {
    clearTimeout(timeoutId);
  }

  let responseBody = "";
  try {
    responseBody = await response.text();
  } catch {
    responseBody = "";
  }

  if (response.ok) {
    return { status: "ok", message: "Account verification check passed." };
  }

  const extracted = extractVerificationErrorDetails(responseBody);
  if (response.status === 403 && extracted.validationRequired) {
    return {
      status: "blocked",
      message: extracted.message ?? "Google requires additional account verification.",
      verifyUrl: extracted.verifyUrl,
    };
  }

  const fallbackMessage = extracted.message ?? `Request failed (${response.status} ${response.statusText}).`;
  return {
    status: "error",
    message: fallbackMessage,
  };
}

export async function promptAccountIndexForVerification(
  accounts: Array<{ email?: string; index: number }>,
): Promise<number | undefined> {
  const { createInterface } = await import("node:readline/promises");
  const { stdin, stdout } = await import("node:process");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log("\nSelect an account to verify:");
    for (const account of accounts) {
      const label = account.email || `Account ${account.index + 1}`;
      console.log(`  ${account.index + 1}. ${label}`);
    }
    console.log("");

    while (true) {
      const answer = (await rl.question("Account number (leave blank to cancel): ")).trim();
      if (!answer) {
        return undefined;
      }
      const parsedIndex = Number(answer);
      if (!Number.isInteger(parsedIndex)) {
        console.log("Please enter a valid account number.");
        continue;
      }
      const normalizedIndex = parsedIndex - 1;
      const selected = accounts.find((account) => account.index === normalizedIndex);
      if (!selected) {
        console.log("Please enter a number from the list above.");
        continue;
      }
      return selected.index;
    }
  } finally {
    rl.close();
  }
}

export function markStoredAccountVerificationRequired(
  account: any,
  message: string,
  verifyUrl?: string,
): boolean {
  if (account.verificationRequired && account.verificationMessage === message && account.verificationUrl === verifyUrl) {
    return false;
  }
  account.verificationRequired = true;
  account.verificationMessage = message;
  account.verificationUrl = verifyUrl;
  return true;
}

export function clearStoredAccountVerificationRequired(
  account: any,
  reEnable: boolean = false,
): { changed: boolean; wasVerificationRequired: boolean } {
  const wasVerificationRequired = !!account.verificationRequired;
  let changed = false;

  if (account.verificationRequired) {
    delete account.verificationRequired;
    delete account.verificationMessage;
    delete account.verificationUrl;
    changed = true;
  }

  if (reEnable && account.enabled === false && wasVerificationRequired) {
    delete account.enabled;
    changed = true;
  }

  return { changed, wasVerificationRequired };
}
