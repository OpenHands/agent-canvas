import SettingsService from "./settings-service/settings-service.api";
import { createSettingsClient } from "./typescript-client";
import {
  CustomSecretPage,
  CustomSecretWithoutValue,
  SearchSecretsParams,
} from "./secrets-service.types";
import { Provider, ProviderOptions, ProviderToken } from "#/types/settings";

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
        if (!(provider in ProviderOptions) || !value || typeof value !== "object") {
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

  window.localStorage.setItem(GIT_PROVIDER_STORAGE_KEY, JSON.stringify(providers));
};

const buildProviderTokensSet = (
  providers: StoredGitProviderTokens,
): Partial<Record<Provider, string | null>> =>
  Object.fromEntries(
    Object.entries(providers).map(([provider, value]) => [provider, value?.host ?? null]),
  ) as Partial<Record<Provider, string | null>>;

export class SecretsService {
  /**
   * Search/list custom secrets with pagination support.
   * Uses the agent-server settings client for local persistence.
   */
  static async searchSecrets(
    params: SearchSecretsParams = {},
  ): Promise<CustomSecretPage> {
    try {
      const client = createSettingsClient();
      const response = await client.listSecrets();

      // Filter by name if requested
      let items = response.secrets.map((s) => ({
        name: s.name,
        description: s.description ?? undefined,
      }));

      if (params.name__contains) {
        const query = params.name__contains.toLowerCase();
        items = items.filter((s) => s.name.toLowerCase().includes(query));
      }

      // Simple pagination (agent-server doesn't have built-in pagination)
      const limit = params.limit ?? 100;
      const startIndex = params.page_id ? parseInt(params.page_id, 10) : 0;
      const paginatedItems = items.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < items.length;

      return {
        items: paginatedItems,
        next_page_id: hasMore ? String(startIndex + limit) : null,
      };
    } catch {
      return { items: [], next_page_id: null };
    }
  }

  /**
   * Get all secrets (names and descriptions only, no values).
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

  /**
   * Create a new custom secret via the agent-server.
   */
  static async createSecret(name: string, value: string, description?: string) {
    try {
      const client = createSettingsClient();
      await client.createSecret({ name, value, description: description ?? null });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update a secret's metadata (description). For agent-server, we need to
   * re-create the secret with the same value since we can't update in place
   * without the value.
   */
  static async updateSecret(_id: string, name: string, description?: string) {
    try {
      // For agent-server, we can only update by re-creating with a new value
      // This is a limitation - in practice, users should delete and recreate
      const client = createSettingsClient();
      const currentValue = await client.getSecretValue(name);
      await client.createSecret({ name, value: currentValue, description: description ?? null });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a custom secret via the agent-server.
   */
  static async deleteSecret(name: string) {
    try {
      const client = createSettingsClient();
      await client.deleteSecret(name);
      return true;
    } catch {
      return false;
    }
  }

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

    writeStoredGitProviders(nextProviders);
    return SettingsService.saveSettings({
      provider_tokens_set: buildProviderTokensSet(nextProviders),
    });
  }

  static async deleteGitProviders(): Promise<boolean> {
    writeStoredGitProviders({});
    return SettingsService.saveSettings({ provider_tokens_set: {} });
  }
}
