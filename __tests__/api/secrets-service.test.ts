import { beforeEach, describe, expect, it } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import { SecretsService } from "#/api/secrets-service";
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
  enterprise_sso: { token: "", host: null },
  ...overrides,
});

describe("SecretsService", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores connected Git providers in local settings", async () => {
    await expect(
      SecretsService.addGitProvider(
        buildProviders({
          github: {
            token: "ghp_test_123",
            host: "github.example.com",
          },
        }),
      ),
    ).resolves.toBe(true);

    const settings = await SettingsService.getSettings();

    expect(settings.provider_tokens_set).toEqual({
      github: "github.example.com",
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

    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "",
          host: "github.internal.example.com",
        },
      }),
    );

    const settings = await SettingsService.getSettings();

    expect(settings.provider_tokens_set).toEqual({
      github: "github.internal.example.com",
    });
  });

  it("clears connected Git providers from local settings", async () => {
    await SecretsService.addGitProvider(
      buildProviders({
        github: {
          token: "ghp_test_123",
          host: "github.com",
        },
      }),
    );

    await expect(SecretsService.deleteGitProviders()).resolves.toBe(true);

    const settings = await SettingsService.getSettings();

    expect(settings.provider_tokens_set).toEqual({});
  });
});
