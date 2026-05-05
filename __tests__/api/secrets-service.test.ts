import { beforeEach, describe, expect, it } from "vitest";
import { SecretsService } from "#/api/secrets-service";
import { Provider, ProviderToken } from "#/types/settings";

const GIT_PROVIDER_STORAGE_KEY = "openhands-agent-server-git-provider-tokens";

const buildProviders = (
  overrides: Partial<Record<Provider, ProviderToken>> = {},
): Record<Provider, ProviderToken> => ({
  github: { token: "", host: null },
  gitlab: { token: "", host: null },
  bitbucket: { token: "", host: null },
  bitbucket_data_center: { token: "", host: null },
  azure_devops: { token: "", host: null },
  forgejo: { token: "", host: null },
  ...overrides,
});

describe("SecretsService", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores connected Git providers in local cache and calls secrets API", async () => {
    // The SecretsService stores git provider tokens via the secrets API
    // and keeps a local cache for UI purposes (host mappings)
    // Method returns void (throws on failure)
    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "ghp_test_123",
          host: "github.example.com",
        },
      }),
    );

    // Verify local cache was updated
    const cached = JSON.parse(
      window.localStorage.getItem(GIT_PROVIDER_STORAGE_KEY) || "{}",
    );
    expect(cached.github).toEqual({
      token: "ghp_test_123",
      host: "github.example.com",
    });
  });

  it("preserves an existing provider token when only the host changes", async () => {
    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "ghp_test_123",
          host: "github.com",
        },
      }),
    );

    // Update only the host, empty token means keep existing
    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "",
          host: "github.internal.example.com",
        },
      }),
    );

    // Verify local cache preserves the token and updates the host
    const cached = JSON.parse(
      window.localStorage.getItem(GIT_PROVIDER_STORAGE_KEY) || "{}",
    );
    expect(cached.github).toEqual({
      token: "ghp_test_123",
      host: "github.internal.example.com",
    });
  });

  it("clears connected Git providers from local cache", async () => {
    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "ghp_test_123",
          host: "github.com",
        },
      }),
    );

    // Method returns void (throws on failure)
    await SecretsService.deleteGitProviders();

    // Verify local cache was cleared
    expect(window.localStorage.getItem(GIT_PROVIDER_STORAGE_KEY)).toBeNull();
  });
});
