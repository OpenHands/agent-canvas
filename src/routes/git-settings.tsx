import React from "react";
import { redirect } from "react-router";
import { useTranslation } from "react-i18next";
import { useSettings } from "#/hooks/query/use-settings";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { BrandButton } from "#/components/features/settings/brand-button";
import { GitHubTokenInput } from "#/components/features/settings/git-settings/github-token-input";
import { GitLabTokenInput } from "#/components/features/settings/git-settings/gitlab-token-input";
import { BitbucketTokenInput } from "#/components/features/settings/git-settings/bitbucket-token-input";
import { BitbucketDCTokenInput } from "#/components/features/settings/git-settings/bitbucket-dc-token-help-input";
import { AzureDevOpsTokenInput } from "#/components/features/settings/git-settings/azure-devops-token-input";
import { ForgejoTokenInput } from "#/components/features/settings/git-settings/forgejo-token-input";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { GitSettingInputsSkeleton } from "#/components/features/settings/git-settings/github-settings-inputs-skeleton";
import { useAddGitProviders } from "#/hooks/mutation/use-add-git-providers";
import { useDeleteGitProviders } from "#/hooks/mutation/use-delete-git-providers";
import { useUserProviders } from "#/hooks/use-user-providers";
import { Provider, ProviderToken } from "#/types/settings";

// /integrations is a local-only page; cloud backends do not expose it.
export const clientLoader = () => {
  if (getActiveBackend().backend.kind === "cloud") {
    return redirect("/conversations");
  }
  return null;
};

export function GitSettingsScreen() {
  const { t } = useTranslation("openhands");

  const { mutate: saveGitProviders, isPending } = useAddGitProviders();
  const { mutate: disconnectGitTokens, isPending: isDisconnecting } =
    useDeleteGitProviders();

  const { data: settings, isLoading } = useSettings();
  const { providers } = useUserProviders();

  const [githubTokenInputHasValue, setGithubTokenInputHasValue] =
    React.useState(false);
  const [gitlabTokenInputHasValue, setGitlabTokenInputHasValue] =
    React.useState(false);
  const [bitbucketTokenInputHasValue, setBitbucketTokenInputHasValue] =
    React.useState(false);
  const [bitbucketDCTokenInputHasValue, setBitbucketDCTokenInputHasValue] =
    React.useState(false);
  const [azureDevOpsTokenInputHasValue, setAzureDevOpsTokenInputHasValue] =
    React.useState(false);
  const [forgejoTokenInputHasValue, setForgejoTokenInputHasValue] =
    React.useState(false);

  const [githubHostInputHasValue, setGithubHostInputHasValue] =
    React.useState(false);
  const [gitlabHostInputHasValue, setGitlabHostInputHasValue] =
    React.useState(false);
  const [bitbucketHostInputHasValue, setBitbucketHostInputHasValue] =
    React.useState(false);
  const [bitbucketDCHostInputHasValue, setBitbucketDCHostInputHasValue] =
    React.useState(false);
  const [azureDevOpsHostInputHasValue, setAzureDevOpsHostInputHasValue] =
    React.useState(false);
  const [forgejoHostInputHasValue, setForgejoHostInputHasValue] =
    React.useState(false);

  const existingGithubHost = settings?.provider_tokens_set.github;
  const existingGitlabHost = settings?.provider_tokens_set.gitlab;
  const existingBitbucketHost = settings?.provider_tokens_set.bitbucket;
  const existingBitbucketDCHost =
    settings?.provider_tokens_set.bitbucket_data_center;
  const existingAzureDevOpsHost = settings?.provider_tokens_set.azure_devops;
  const existingForgejoHost = settings?.provider_tokens_set.forgejo;

  const isGitHubTokenSet = providers.includes("github");
  const isGitLabTokenSet = providers.includes("gitlab");
  const isBitbucketTokenSet = providers.includes("bitbucket");
  const isBitbucketDCTokenSet = providers.includes("bitbucket_data_center");
  const isAzureDevOpsTokenSet = providers.includes("azure_devops");
  const isForgejoTokenSet = providers.includes("forgejo");

  const formAction = async (formData: FormData) => {
    const disconnectButtonClicked =
      formData.get("disconnect-tokens-button") !== null;

    if (disconnectButtonClicked) {
      disconnectGitTokens(undefined, {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
        },
        onError: (error) => {
          const errorMessage = retrieveAxiosErrorMessage(error);
          displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
        },
      });
      return;
    }

    const githubToken = (
      formData.get("github-token-input")?.toString() || ""
    ).trim();
    const gitlabToken = (
      formData.get("gitlab-token-input")?.toString() || ""
    ).trim();
    const bitbucketToken = (
      formData.get("bitbucket-token-input")?.toString() || ""
    ).trim();
    const bitbucketDCToken = (
      formData.get("bitbucket-dc-token-input")?.toString() || ""
    ).trim();
    const azureDevOpsToken = (
      formData.get("azure-devops-token-input")?.toString() || ""
    ).trim();
    const forgejoToken = (
      formData.get("forgejo-token-input")?.toString() || ""
    ).trim();
    const githubHost = (
      formData.get("github-host-input")?.toString() || ""
    ).trim();
    const gitlabHost = (
      formData.get("gitlab-host-input")?.toString() || ""
    ).trim();
    const bitbucketHost = (
      formData.get("bitbucket-host-input")?.toString() || ""
    ).trim();
    const bitbucketDCHost = (
      formData.get("bitbucket-dc-host-input")?.toString() || ""
    ).trim();
    const azureDevOpsHost = (
      formData.get("azure-devops-host-input")?.toString() || ""
    ).trim();
    const forgejoHost = (
      formData.get("forgejo-host-input")?.toString() || ""
    ).trim();

    const providerTokens: Partial<Record<Provider, ProviderToken>> = {
      github: { token: githubToken, host: githubHost },
      gitlab: { token: gitlabToken, host: gitlabHost },
      bitbucket: { token: bitbucketToken, host: bitbucketHost },
      bitbucket_data_center: { token: bitbucketDCToken, host: bitbucketDCHost },
      azure_devops: { token: azureDevOpsToken, host: azureDevOpsHost },
      forgejo: { token: forgejoToken, host: forgejoHost },
    };

    saveGitProviders(
      {
        providers: providerTokens,
      },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
        },
        onError: (error) => {
          const errorMessage = retrieveAxiosErrorMessage(error);
          displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
        },
        onSettled: () => {
          setGithubTokenInputHasValue(false);
          setGitlabTokenInputHasValue(false);
          setBitbucketTokenInputHasValue(false);
          setBitbucketDCTokenInputHasValue(false);
          setAzureDevOpsTokenInputHasValue(false);
          setForgejoTokenInputHasValue(false);
          setGithubHostInputHasValue(false);
          setGitlabHostInputHasValue(false);
          setBitbucketHostInputHasValue(false);
          setBitbucketDCHostInputHasValue(false);
          setAzureDevOpsHostInputHasValue(false);
          setForgejoHostInputHasValue(false);
        },
      },
    );
  };

  const formIsClean =
    !githubTokenInputHasValue &&
    !gitlabTokenInputHasValue &&
    !bitbucketTokenInputHasValue &&
    !bitbucketDCTokenInputHasValue &&
    !azureDevOpsTokenInputHasValue &&
    !forgejoTokenInputHasValue &&
    !githubHostInputHasValue &&
    !gitlabHostInputHasValue &&
    !bitbucketHostInputHasValue &&
    !bitbucketDCHostInputHasValue &&
    !azureDevOpsHostInputHasValue &&
    !forgejoHostInputHasValue;

  return (
    <form
      data-testid="git-settings-screen"
      action={formAction}
      className="flex flex-col h-full justify-between"
    >
      {!isLoading && (
        <div className="flex flex-col gap-4">
          <GitHubTokenInput
            name="github-token-input"
            isGitHubTokenSet={isGitHubTokenSet}
            onChange={(value) => {
              setGithubTokenInputHasValue(!!value);
            }}
            onGitHubHostChange={(value) => {
              setGithubHostInputHasValue(!!value);
            }}
            githubHostSet={existingGithubHost}
          />

          <GitLabTokenInput
            name="gitlab-token-input"
            isGitLabTokenSet={isGitLabTokenSet}
            onChange={(value) => {
              setGitlabTokenInputHasValue(!!value);
            }}
            onGitLabHostChange={(value) => {
              setGitlabHostInputHasValue(!!value);
            }}
            gitlabHostSet={existingGitlabHost}
          />

          <BitbucketTokenInput
            name="bitbucket-token-input"
            isBitbucketTokenSet={isBitbucketTokenSet}
            onChange={(value) => {
              setBitbucketTokenInputHasValue(!!value);
            }}
            onBitbucketHostChange={(value) => {
              setBitbucketHostInputHasValue(!!value);
            }}
            bitbucketHostSet={existingBitbucketHost}
          />

          <BitbucketDCTokenInput
            name="bitbucket-dc-token-input"
            isBitbucketDCTokenSet={isBitbucketDCTokenSet}
            onChange={(value) => {
              setBitbucketDCTokenInputHasValue(!!value);
            }}
            onBitbucketDCHostChange={(value) => {
              setBitbucketDCHostInputHasValue(!!value);
            }}
            bitbucketDCHostSet={existingBitbucketDCHost}
          />

          <AzureDevOpsTokenInput
            name="azure-devops-token-input"
            isAzureDevOpsTokenSet={isAzureDevOpsTokenSet}
            onChange={(value) => {
              setAzureDevOpsTokenInputHasValue(!!value);
            }}
            onAzureDevOpsHostChange={(value) => {
              setAzureDevOpsHostInputHasValue(!!value);
            }}
            azureDevOpsHostSet={existingAzureDevOpsHost}
          />

          <ForgejoTokenInput
            name="forgejo-token-input"
            isForgejoTokenSet={isForgejoTokenSet}
            onChange={(value) => {
              setForgejoTokenInputHasValue(!!value);
            }}
            onForgejoHostChange={(value) => {
              setForgejoHostInputHasValue(!!value);
            }}
            forgejoHostSet={existingForgejoHost}
          />
        </div>
      )}

      {isLoading && <GitSettingInputsSkeleton />}

      <div className="flex gap-6 p-6 justify-end">
        <BrandButton
          testId="disconnect-tokens-button"
          name="disconnect-tokens-button"
          type="submit"
          variant="secondary"
          isDisabled={
            isDisconnecting ||
            (!isGitHubTokenSet &&
              !isGitLabTokenSet &&
              !isBitbucketTokenSet &&
              !isBitbucketDCTokenSet &&
              !isAzureDevOpsTokenSet &&
              !isForgejoTokenSet)
          }
        >
          {t("GIT$DISCONNECT_TOKENS")}
        </BrandButton>
        <BrandButton
          testId="submit-button"
          type="submit"
          variant="primary"
          isDisabled={isPending || isDisconnecting || formIsClean}
        >
          {!isPending && t("SETTINGS$SAVE_CHANGES")}
          {isPending && t("SETTINGS$SAVING")}
        </BrandButton>
      </div>
    </form>
  );
}

export default GitSettingsScreen;
