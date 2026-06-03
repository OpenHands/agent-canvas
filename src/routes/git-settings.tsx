import React from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "#/hooks/query/use-settings";
import { useSearchSecrets } from "#/hooks/query/use-get-secrets";
import { BrandButton } from "#/components/features/settings/brand-button";
import { GitHubTokenInput } from "#/components/features/settings/git-settings/github-token-input";
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
import { ProviderToken } from "#/types/settings";
import { getGitProviderSecretName } from "#/api/git-provider-secrets";

export function GitSettingsScreen() {
  const { t } = useTranslation("openhands");

  const { mutate: saveGitProviders, isPending } = useAddGitProviders();
  const { mutate: disconnectGitTokens, isPending: isDisconnecting } =
    useDeleteGitProviders();

  const { data: settings, isLoading } = useSettings();
  const { providers } = useUserProviders();
  const { data: secrets, isLoading: isLoadingSecrets } = useSearchSecrets({
    includeGitProviderSecrets: true,
  });

  const [githubTokenInputHasValue, setGithubTokenInputHasValue] =
    React.useState(false);
  const [githubHostInputHasValue, setGithubHostInputHasValue] =
    React.useState(false);

  const existingGithubHost = settings?.provider_tokens_set.github;
  const githubSecretName = getGitProviderSecretName("github");
  const hasGithubSecret = secrets?.some(
    (secret) => secret.name === githubSecretName,
  );
  const isGitHubTokenSet =
    providers.includes("github") || hasGithubSecret === true;

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
    const githubHost = (
      formData.get("github-host-input")?.toString() || ""
    ).trim();

    const providersToSave: Partial<Record<"github", ProviderToken>> = {
      github: {
        token: githubToken,
        host: githubHost || null,
      },
    };

    saveGitProviders(
      { providers: providersToSave },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
          setGithubTokenInputHasValue(false);
          setGithubHostInputHasValue(false);
        },
        onError: (error) => {
          const errorMessage = retrieveAxiosErrorMessage(error);
          displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
        },
      },
    );
  };

  const formIsClean = !githubTokenInputHasValue && !githubHostInputHasValue;
  const shouldBeLoading = isLoading || isLoadingSecrets;

  return (
    <form
      data-testid="git-settings-screen"
      action={formAction}
      className="flex flex-col gap-6"
    >
      {!shouldBeLoading && (
        <>
          <p className="max-w-2xl text-sm leading-5 text-tertiary-light">
            {t(I18nKey.SETTINGS$PAGE_GIT_INTRO)}
          </p>

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
        </>
      )}

      {shouldBeLoading && <GitSettingInputsSkeleton />}

      <div className="flex justify-end gap-4 pt-2">
        <BrandButton
          testId="disconnect-tokens-button"
          name="disconnect-tokens-button"
          type="submit"
          variant="secondary"
          isDisabled={isDisconnecting || !isGitHubTokenSet}
        >
          {t(I18nKey.GIT$DISCONNECT_TOKENS)}
        </BrandButton>
        <BrandButton
          testId="submit-button"
          type="submit"
          variant="primary"
          isDisabled={isPending || isDisconnecting || formIsClean}
        >
          {!isPending && t(I18nKey.SETTINGS$SAVE_CHANGES)}
          {isPending && t(I18nKey.SETTINGS$SAVING)}
        </BrandButton>
      </div>
    </form>
  );
}

export default GitSettingsScreen;
