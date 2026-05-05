import { createHttpClient } from "./typescript-client";
import {
  CustomSecretWithoutValue,
} from "./secrets-service.types";
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

const GIT_PROVIDER_STORAGE_KEY = "openhands-agent-server-git-provider-tokens";

type StoredGitProviderTokens = Partial<Record<Provider, ProviderToken>>;

const normalizeHost = (host: string | null | undefined): string | null => {
  const trimmed = typeof host === "string" ? host.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

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

export const getStoredGitProviders = (): StoredGitProviderTokens =>
  readStoredGitProviders();

export const getStoredGitProviderToken = (
  provider: Provider,
): ProviderToken | null => readStoredGitProviders()[provider] ?? null;

const buildProviderTokensSet = (
  providers: StoredGitProviderTokens,
): Partial<Record<Provider, string | null>> =>
  Object.fromEntries(
    Object.entries(providers).map(([provider, value]) => [
      provider,
      value?.host ?? null,
    ]),
  ) as Partial<Record<Provider, string | null>>;

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
      const response = await createHttpClient().get<SecretsListResponse>(
        "/api/settings/secrets",
      );
      return response.data.secrets.map((s) => ({
        name: s.name,
        description: s.description,
      }));
    } catch (error) {
      console.error("Failed to fetch secrets:", error);
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
   */
  static async createSecret(
    name: string,
    value: string,
    description?: string,
  ): Promise<boolean> {
    try {
      await createHttpClient().put<CreateSecretResponse>(
        "/api/settings/secrets",
        {
          name,
          value,
          description,
        } satisfies CreateSecretRequest,
      );
      return true;
    } catch (error) {
      console.error(`Failed to create/update secret '${name}':`, error);
      return false;
    }
  }

  /**
   * Update a secret's value and/or description.
   * Uses the same upsert endpoint as createSecret since agent-server
   * doesn't have a separate update endpoint.
   *
   * @param name - Secret name (used as identifier)
   * @param value - New secret value
   * @param description - Optional new description
   */
  static async updateSecret(
    name: string,
    value: string,
    description?: string,
  ): Promise<boolean> {
    // Agent-server uses upsert, so update is the same as create
    return this.createSecret(name, value, description);
  }

  /**
   * Delete a custom secret by name.
   * Uses the agent-server API endpoint: DELETE /api/settings/secrets/{name}
   *
   * @param name - Secret name to delete
   */
  static async deleteSecret(name: string): Promise<boolean> {
    try {
      const response = await createHttpClient().delete<{ deleted: boolean }>(
        `/api/settings/secrets/${encodeURIComponent(name)}`,
      );
      return response.data?.deleted ?? true;
    } catch (error) {
      // 404 means secret doesn't exist - treat as successful deletion
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        return true;
      }
      console.error(`Failed to delete secret '${name}':`, error);
      return false;
    }
  }

  /**
   * Add or update git provider tokens.
   * Stores tokens via the agent server secrets API and keeps a local
   * cache for UI purposes (host mappings).
   */
  static async addGitProvider(
    providers: Partial<Record<Provider, ProviderToken>>,
  ): Promise<boolean> {
    const storedProviders = readStoredGitProviders();
    const nextProviders: StoredGitProviderTokens = { ...storedProviders };

    for (const [provider, value] of Object.entries(providers) as [
      Provider,
      ProviderToken,
    ][]) {
      const token = value.token.trim();
      const host = normalizeHost(value.host);

      if (token) {
        // Store the token as a secret via the agent server API
        // Use a consistent naming convention for git provider tokens
        const secretName = `GIT_PROVIDER_${provider.toUpperCase()}_TOKEN`;
        try {
          await createHttpClient().put<void>("/api/settings/secrets", {
            name: secretName,
            value: token,
            description: `Git provider token for ${provider}${host ? ` (${host})` : ""}`,
          } satisfies CreateSecretRequest);
        } catch (error) {
          console.error(`Failed to store git provider token for ${provider}:`, error);
          // Continue anyway - fall back to local storage
        }

        nextProviders[provider] = { token, host };
        continue;
      }

      const existing = nextProviders[provider];
      if (existing) {
        nextProviders[provider] = {
          token: existing.token,
          host,
        };
      }
    }

    // Keep local cache for UI purposes (host mappings, etc.)
    writeStoredGitProviders(nextProviders);
    return true;
  }

  /**
   * Delete all git provider tokens.
   */
  static async deleteGitProviders(): Promise<boolean> {
    const storedProviders = readStoredGitProviders();

    // Delete each provider's secret from the server
    for (const provider of Object.keys(storedProviders) as Provider[]) {
      const secretName = `GIT_PROVIDER_${provider.toUpperCase()}_TOKEN`;
      try {
        await createHttpClient().delete(`/api/settings/secrets/${secretName}`);
      } catch (error) {
        // Ignore 404 errors (secret doesn't exist)
        console.warn(`Failed to delete git provider secret for ${provider}:`, error);
      }
    }

    writeStoredGitProviders({});
    return true;
  }
}
