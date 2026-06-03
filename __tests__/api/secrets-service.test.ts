import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecretsService } from "#/api/secrets-service";
import { GIT_PROVIDER_STORAGE_KEY } from "#/api/git-provider-secrets";
import { Provider, ProviderToken } from "#/types/settings";

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

describe("SecretsService git providers", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores connected Git providers in local cache and calls secrets API", async () => {
    const createSecretSpy = vi
      .spyOn(SecretsService, "createSecret")
      .mockResolvedValue(undefined);

    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "ghp_test_123",
          host: "github.example.com",
        },
      }),
    );

    expect(createSecretSpy).toHaveBeenCalledWith(
      "GIT_PROVIDER_GITHUB_TOKEN",
      "ghp_test_123",
      "Git provider token for github (github.example.com)",
    );

    const cached = JSON.parse(
      window.localStorage.getItem(GIT_PROVIDER_STORAGE_KEY) || "{}",
    );
    expect(cached.github).toEqual({
      token: "ghp_test_123",
      host: "github.example.com",
    });
  });

  it("preserves an existing provider token when only the host changes", async () => {
    vi.spyOn(SecretsService, "createSecret").mockResolvedValue(undefined);

    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "ghp_test_123",
          host: "github.com",
        },
      }),
    );

    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "",
          host: "github.internal.example.com",
        },
      }),
    );

    const cached = JSON.parse(
      window.localStorage.getItem(GIT_PROVIDER_STORAGE_KEY) || "{}",
    );
    expect(cached.github).toEqual({
      token: "ghp_test_123",
      host: "github.internal.example.com",
    });
  });

  it("clears connected Git providers from local cache", async () => {
    vi.spyOn(SecretsService, "createSecret").mockResolvedValue(undefined);
    vi.spyOn(SecretsService, "deleteSecret").mockResolvedValue(undefined);

    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "ghp_test_123",
          host: "github.com",
        },
      }),
    );

    await SecretsService.deleteGitProviders();

    expect(window.localStorage.getItem(GIT_PROVIDER_STORAGE_KEY)).toBeNull();
  });
});
