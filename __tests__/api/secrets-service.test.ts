import { describe, expect, it } from "vitest";
import {
  GIT_PROVIDER_TOKENS_UNSUPPORTED_MESSAGE,
  SecretsService,
} from "#/api/secrets-service";
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
  it("fails fast when Git provider token persistence is unavailable", async () => {
    await expect(
      SecretsService.addGitProvider(
        buildProviders({
          github: { token: "ghp_test_123", host: null },
        }),
      ),
    ).rejects.toThrow(GIT_PROVIDER_TOKENS_UNSUPPORTED_MESSAGE);
  });
});
