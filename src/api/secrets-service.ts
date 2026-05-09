import { getActiveBackend } from "./backend-registry/active-store";
import {
  createCloudSecret,
  deleteCloudSecret,
  fetchCloudSecrets,
  updateCloudSecret,
} from "./cloud/secrets-service.api";
import { createHttpClient } from "./typescript-client";
import { CustomSecretWithoutValue } from "./secrets-service.types";
import { Provider, ProviderOptions, ProviderToken } from "#/types/settings";

/**
 * Response from GET /api/settings/secrets (agent-server API)
 */
interface SecretsListResponse {
  secrets: Array<{
    name: string;
    description?: string;
  }>;
}

/**
 * Request for PUT /api/settings/secrets (agent-server API)
 * This is an upsert operation - creates or updates by name.
 */
interface CreateSecretRequest {
  name: string;
  value: string;
  description?: string;
}

/**
 * Response from PUT /api/settings/secrets (agent-server API)
 */
interface CreateSecretResponse {
  name: string;
  description?: string;
}

const normalizeHost = (host: string | null | undefined): string | null => {
  const trimmed = typeof host === "string" ? host.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Retry helper for API calls with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries - 1) {
        throw error;
      }

      const delay = baseDelayMs * 2 ** attempt;
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }

  throw new Error("Retry attempts exhausted");
}

/**
 * Get the secret name for a git provider token.
 */
function getGitProviderSecretName(provider: Provider): string {
  return `GIT_PROVIDER_${provider.toUpperCase()}_TOKEN`;
}

// ============================================================================
// Git Provider Token Storage (for frontend git API calls)
// ============================================================================
// Note: Git provider tokens need to be accessible from the frontend to make
// direct API calls to GitHub/GitLab/etc. for repo search, branches, etc.
// These are stored in localStorage for frontend use AND synced to the server
// for agent runtime use.
// ============================================================================

const GIT_PROVIDER_STORAGE_KEY = "openhands-agent-server-git-provider-tokens";

type StoredGitProviderTokens = Partial<Record<Provider, ProviderToken>>;

const readStoredGitProviders = (): StoredGitProviderTokens => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(GIT_PROVIDER_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([provider, value]) => {
        if (
          !(provider in ProviderOptions) ||
          !value ||
          typeof value !== "object"
        ) {
          return [];
        }

        const token =
          typeof (value as ProviderToken).token === "string"
            ? (value as ProviderToken).token.trim()
            : "";

        if (!token) {
          return [];
        }

        return [
          [
            provider,
            {
              token,
              host: normalizeHost((value as ProviderToken).host),
            },
          ],
        ];
      }),
    ) as StoredGitProviderTokens;
  } catch {
    return {};
  }
};

const writeStoredGitProviders = (providers: StoredGitProviderTokens) => {
  if (typeof window === "undefined") {
    return;
  }

  if (Object.keys(providers).length === 0) {
    window.localStorage.removeItem(GIT_PROVIDER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    GIT_PROVIDER_STORAGE_KEY,
    JSON.stringify(providers),
  );
};

/**
 * Get stored git provider tokens for frontend API calls.
 * These are stored locally for making direct GitHub/GitLab API calls.
 */
export const getStoredGitProviders = (): StoredGitProviderTokens =>
  readStoredGitProviders();

/**
 * Get a specific git provider token for frontend API calls.
 */
export const getStoredGitProviderToken = (
  provider: Provider,
): ProviderToken | null => readStoredGitProviders()[provider] ?? null;

export class SecretsService {
  /**
   * List all custom secrets (names and descriptions only, no values).
   * Uses the agent-server API endpoint: GET /api/settings/secrets
   *
   * Note: The agent-server API doesn't support pagination or search filtering.
   * All secrets are returned in a single response.
   */
  static async getSecrets(): Promise<CustomSecretWithoutValue[]> {
    try {
      if (getActiveBackend().backend.kind === "cloud") {
        return await withRetry(() => fetchCloudSecrets());
      }
      const response = await withRetry(() =>
        createHttpClient().get<SecretsListResponse>("/api/settings/secrets"),
      );
      return response.data.secrets.map((s) => ({
        name: s.name,
        description: s.description,
      }));
    } catch (error) {
      console.error("Failed to fetch secrets after retries:", error);
      return [];
    }
  }

  /**
   * Create or update a custom secret (upsert by name).
   * Uses the agent-server API endpoint: PUT /api/settings/secrets
   *
   * @param name - Secret name (must start with letter, contain only letters/numbers/underscores, 1-64 chars)
   * @param value - Secret value
   * @param description - Optional description
   * @throws Error if the API call fails after retries
   */
  static async createSecret(
    name: string,
    value: string,
    description?: string,
  ): Promise<void> {
    if (getActiveBackend().backend.kind === "cloud") {
      await withRetry(() => createCloudSecret(name, value, description));
      return;
    }
    await withRetry(() =>
      createHttpClient().put<CreateSecretResponse>("/api/settings/secrets", {
        name,
        value,
        description,
      } satisfies CreateSecretRequest),
    );
  }

  /**
   * Update a secret's value and/or description.
   * Uses the same upsert endpoint as createSecret since agent-server
   * doesn't have a separate update endpoint.
   *
   * @param name - Secret name (used as identifier)
   * @param value - New secret value
   * @param description - Optional new description
   * @throws Error if the API call fails after retries
   */
  static async updateSecret(
    name: string,
    value: string,
    description?: string,
  ): Promise<void> {
    if (getActiveBackend().backend.kind === "cloud") {
      // The cloud PUT endpoint renames + redescribes only (no value field),
      // matching what `useUpdateSecret` actually sends:
      // (secretToEdit=name, newName=value, description).
      await withRetry(() => updateCloudSecret(name, value, description));
      return;
    }
    // Agent-server uses upsert, so update is the same as create
    await this.createSecret(name, value, description);
  }

  /**
   * Delete a custom secret by name.
   * Uses the agent-server API endpoint: DELETE /api/settings/secrets/{name}
   *
   * @param name - Secret name to delete
   * @throws Error if the API call fails (except 404, which is treated as success)
   */
  static async deleteSecret(name: string): Promise<void> {
    try {
      if (getActiveBackend().backend.kind === "cloud") {
        await withRetry(() => deleteCloudSecret(name));
        return;
      }
      await withRetry(() =>
        createHttpClient().delete<{ deleted: boolean }>(
          `/api/settings/secrets/${encodeURIComponent(name)}`,
        ),
      );
    } catch (error) {
      // 404 means secret doesn't exist - treat as successful deletion
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        return;
      }
      throw error;
    }
  }

  /**
   * Add or update git provider tokens.
   * Stores tokens in both:
   * 1. localStorage - for frontend git API calls (repo search, branches, etc.)
   * 2. Agent server secrets API - for agent runtime use
   *
   * Both stores must succeed for the operation to complete successfully.
   *
   * @throws Error if the server API call fails after retries
   */
  static async addGitProvider(
    providers: Partial<Record<Provider, ProviderToken>>,
  ): Promise<void> {
    const storedProviders = readStoredGitProviders();
    const nextProviders: StoredGitProviderTokens = { ...storedProviders };

    const entries = Object.entries(providers) as [Provider, ProviderToken][];

    for (const [provider, value] of entries) {
      const token = value.token.trim();
      const host = normalizeHost(value.host);
      const nextToken = token || nextProviders[provider]?.token;

      if (nextToken) {
        const secretName = getGitProviderSecretName(provider);
        // eslint-disable-next-line no-await-in-loop
        await this.createSecret(
          secretName,
          nextToken,
          `Git provider token for ${provider}${host ? ` (${host})` : ""}`,
        );

        // Only update localStorage after server storage succeeds
        nextProviders[provider] = { token: nextToken, host };
      }
    }

    // Update localStorage for frontend git API calls
    writeStoredGitProviders(nextProviders);
  }

  /**
   * Delete all git provider tokens from both localStorage and server.
   */
  static async deleteGitProviders(): Promise<void> {
    const storedProviders = readStoredGitProviders();

    // Delete each provider's secret from the server
    await Promise.all(
      (Object.keys(storedProviders) as Provider[]).map(async (provider) => {
        const secretName = getGitProviderSecretName(provider);
        try {
          await this.deleteSecret(secretName);
        } catch (error) {
          // Log but continue - we still want to clear other providers
          console.warn(
            `Failed to delete git provider secret for ${provider}:`,
            error,
          );
        }
      }),
    );

    // Clear localStorage
    writeStoredGitProviders({});
  }
}
