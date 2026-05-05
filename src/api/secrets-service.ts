import { createHttpClient } from "./typescript-client";
import { openHands } from "./open-hands-axios";
import {
  CustomSecret,
  CustomSecretPage,
  CustomSecretWithoutValue,
  SearchSecretsParams,
} from "./secrets-service.types";
import { Provider, ProviderOptions, ProviderToken } from "#/types/settings";

/**
 * Response from GET /api/settings/secrets
 */
interface SecretsListResponse {
  secrets: Array<{
    name: string;
    description?: string;
  }>;
}

/**
 * Request for PUT /api/settings/secrets
 */
interface CreateSecretRequest {
  name: string;
  value: string;
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
   * Search/list custom secrets with pagination support.
   * Uses the new V1 API endpoint: GET /api/v1/secrets/search
   */
  static async searchSecrets(
    params: SearchSecretsParams = {},
  ): Promise<CustomSecretPage> {
    const queryParams = new URLSearchParams();

    if (params.name__contains) {
      queryParams.set("name__contains", params.name__contains);
    }
    if (params.page_id) {
      queryParams.set("page_id", params.page_id);
    }
    if (params.limit) {
      queryParams.set("limit", params.limit.toString());
    }

    const queryString = queryParams.toString();
    const url = `/api/v1/secrets/search${queryString ? `?${queryString}` : ""}`;

    const { data } = await openHands.get<CustomSecretPage>(url);
    return data;
  }

  /**
   * @deprecated Use searchSecrets instead. This method uses the deprecated V0 API.
   */
  static async getSecrets(): Promise<CustomSecretWithoutValue[]> {
    const allSecrets: CustomSecretWithoutValue[] = [];
    let pageId: string | null = null;

    for (;;) {
      const page = await SecretsService.searchSecrets({
        page_id: pageId ?? undefined,
        limit: 100,
      });
      allSecrets.push(...page.items);
      pageId = page.next_page_id;
      if (!pageId) break;
    }

    return allSecrets;
  }

  static async createSecret(name: string, value: string, description?: string) {
    const secret: CustomSecret = {
      name,
      value,
      description,
    };

    const { status } = await openHands.post("/api/v1/secrets", secret);
    return status === 201;
  }

  static async updateSecret(id: string, name: string, description?: string) {
    const secret: CustomSecretWithoutValue = {
      name,
      description,
    };

    const { status } = await openHands.put(`/api/v1/secrets/${id}`, secret);
    return status === 200;
  }

  static async deleteSecret(id: string) {
    const { status } = await openHands.delete<boolean>(`/api/v1/secrets/${id}`);
    return status === 200;
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
