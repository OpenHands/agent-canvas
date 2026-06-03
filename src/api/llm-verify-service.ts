/**
 * LLM configuration verification via direct provider API calls.
 *
 * Makes a minimal chat-completion request to the LLM provider to confirm that
 * the model + API key combination is valid.  Results are intentionally
 * coarse-grained:
 *
 *  - success       – provider accepted the credentials
 *  - auth_error    – credentials were rejected (401 / 403); block save
 *  - network_error – request could not be sent or timed out (CORS, offline)
 *                    the user should be warned but not blocked from saving
 *  - unsupported   – provider cannot be verified from a browser (e.g. AWS
 *                    Bedrock, Azure with IP-allowlisting, no API key)
 */

export type VerifyStatus =
  | "success"
  | "auth_error"
  | "network_error"
  | "unsupported";

export interface VerifyResult {
  status: VerifyStatus;
  /** Human-readable detail from the provider, or a generic fallback. */
  message?: string;
}

// ── Provider classification ───────────────────────────────────────────────

const ANTHROPIC_BASE = "https://api.anthropic.com";
const OPENAI_BASE = "https://api.openai.com";
const OPENHANDS_PROXY_BASE = "https://llm-proxy.app.all-hands.dev";

/** Providers that use the Anthropic Messages API format. */
const ANTHROPIC_PROVIDERS = new Set(["anthropic"]);

/** Providers that use an OpenAI-compatible Chat Completions API. */
const OPENAI_COMPAT_PROVIDERS = new Set([
  "openai",
  "openhands",
  "groq",
  "together_ai",
  "mistral",
  "deepseek",
  "xai",
  "fireworks_ai",
  "anyscale",
  "perplexity",
  "lepton",
  "openrouter",
  "replicate",
  "huggingface",
]);

/** Providers that cannot be called directly from a browser. */
const UNSUPPORTED_PROVIDERS = new Set([
  "azure",
  "bedrock",
  "sagemaker",
  "vertex_ai",
  "palm",
  "google",
  "cohere",
  "ai21",
  "aleph_alpha",
  "nlp_cloud",
]);

// ── Helpers ───────────────────────────────────────────────────────────────

/** Returns the provider prefix from a LiteLLM-style "provider/model" string. */
const getProvider = (model: string): string => {
  const idx = model.indexOf("/");
  return idx === -1 ? "" : model.slice(0, idx).toLowerCase();
};

/** Returns the bare model name after the optional "provider/" prefix. */
const getModelId = (model: string): string => {
  const idx = model.indexOf("/");
  return idx === -1 ? model : model.slice(idx + 1);
};

/** Extract an error message from a failed API response body (best-effort). */
async function readErrorMessage(
  response: Response,
): Promise<string | undefined> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    // Anthropic: { error: { message } }
    // OpenAI:    { error: { message } }
    const errorObj = body?.error as Record<string, unknown> | undefined;
    if (typeof errorObj?.message === "string") return errorObj.message;
  } catch {
    // ignore
  }
  return undefined;
}

// ── Provider-specific callers ─────────────────────────────────────────────

async function verifyAnthropic(
  model: string,
  apiKey: string,
  baseUrl?: string,
): Promise<VerifyResult> {
  const endpoint = `${baseUrl?.replace(/\/$/, "") ?? ANTHROPIC_BASE}/v1/messages`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: getModelId(model),
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok || res.status === 529) {
      // 529 = overloaded; credentials were accepted
      return { status: "success" };
    }

    if (res.status === 401 || res.status === 403) {
      const message = await readErrorMessage(res);
      return { status: "auth_error", message };
    }

    // 400 (bad request / invalid model), 404, 422, etc.
    // Credentials were accepted; the model name might be wrong,
    // but that's a non-blocking misconfiguration.
    return { status: "success" };
  } catch {
    return { status: "network_error" };
  }
}

async function verifyOpenAICompat(
  model: string,
  apiKey: string,
  baseUrl?: string,
  provider?: string,
): Promise<VerifyResult> {
  const base =
    baseUrl?.replace(/\/$/, "") ??
    (provider === "openhands" ? OPENHANDS_PROXY_BASE : OPENAI_BASE);

  const endpoint = `${base}/v1/chat/completions`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok || res.status === 429) {
      // 429 = rate-limited; credentials were accepted
      return { status: "success" };
    }

    if (res.status === 401 || res.status === 403) {
      const message = await readErrorMessage(res);
      return { status: "auth_error", message };
    }

    // 400 / 404 / 422 — key accepted but model might not exist; non-blocking
    return { status: "success" };
  } catch {
    return { status: "network_error" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Verify that `model` + `apiKey` (+ optional `baseUrl`) can successfully
 * reach the LLM provider.
 *
 * Returns `{ status: 'unsupported' }` when:
 *  - The provider is known to block direct browser requests (Azure, Bedrock…)
 *  - The provider is unrecognised and no base URL was given
 *
 * Note: an empty `apiKey` does NOT skip verification for known providers —
 * the request is still sent so that the server's 401 is surfaced to the user
 * as an auth_error rather than silently saving an unusable configuration.
 * Custom base URLs pointing to auth-free local servers (e.g. Ollama) will
 * simply succeed with an empty token, which is the correct behaviour.
 */
export async function verifyLlmConfig(
  model: string,
  apiKey: string,
  baseUrl?: string,
): Promise<VerifyResult> {
  const trimmedKey = apiKey.trim();
  const provider = getProvider(model);

  if (UNSUPPORTED_PROVIDERS.has(provider)) {
    return { status: "unsupported" };
  }

  if (ANTHROPIC_PROVIDERS.has(provider)) {
    return verifyAnthropic(model, trimmedKey, baseUrl);
  }

  if (OPENAI_COMPAT_PROVIDERS.has(provider) || baseUrl) {
    return verifyOpenAICompat(model, trimmedKey, baseUrl, provider);
  }

  // Unknown provider with no base URL and no API key: nothing to verify.
  return { status: "unsupported" };
}
