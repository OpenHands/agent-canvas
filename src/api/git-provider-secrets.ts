import { Provider, ProviderOptions, ProviderToken } from "#/types/settings";

export const GIT_PROVIDER_STORAGE_KEY =
  "openhands-agent-server-git-provider-tokens";

export const GIT_PROVIDER_SECRET_PREFIX = "GIT_PROVIDER_";

export const GIT_PROVIDER_SECRET_SUFFIX = "_TOKEN";

type StoredGitProviderTokens = Partial<Record<Provider, ProviderToken>>;

const normalizeHost = (host: string | null | undefined): string | null => {
  const trimmed = typeof host === "string" ? host.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

export const getGitProviderSecretName = (provider: Provider): string =>
  `${GIT_PROVIDER_SECRET_PREFIX}${provider.toUpperCase()}${GIT_PROVIDER_SECRET_SUFFIX}`;

export const isGitProviderSecretName = (name: string): boolean =>
  name.startsWith(GIT_PROVIDER_SECRET_PREFIX) &&
  name.endsWith(GIT_PROVIDER_SECRET_SUFFIX);

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
 * Read git provider tokens cached in localStorage for frontend UI state.
 * Token values are used only for host-preservation on save; the agent
 * runtime reads credentials from the agent-server secrets API.
 */
export const getStoredGitProviders = (): StoredGitProviderTokens =>
  readStoredGitProviders();

export const writeGitProviderCache = (
  providers: StoredGitProviderTokens,
): void => {
  writeStoredGitProviders(providers);
};

export const clearGitProviderCache = (): void => {
  writeStoredGitProviders({});
};

export const buildProviderTokensSetFromCache = (
  providers: StoredGitProviderTokens,
): Partial<Record<Provider, string | null>> =>
  Object.fromEntries(
    Object.entries(providers).map(([provider, value]) => [
      provider,
      value?.host ?? null,
    ]),
  ) as Partial<Record<Provider, string | null>>;

export const normalizeGitProviderHost = normalizeHost;
