import { Trans, useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { SettingsInput } from "../settings-input";
import { KeyStatusIcon } from "../key-status-icon";
import { cn } from "#/utils/utils";

function GitHubTokenHelpAnchor() {
  const { t } = useTranslation("openhands");

  return (
    <p data-testid="github-token-help-anchor" className="text-xs">
      <Trans
        ns="openhands"
        i18nKey={I18nKey.GITHUB$TOKEN_HELP_TEXT}
        components={[
          <a
            key="github-token-help-anchor-link"
            aria-label={t(I18nKey.GIT$GITHUB_TOKEN_HELP_LINK)}
            href="https://github.com/settings/tokens/new?description=openhands-app&scopes=repo,user,workflow"
            target="_blank"
            className="underline underline-offset-2"
            rel="noopener noreferrer"
          />,
          <a
            key="github-token-help-anchor-link-2"
            aria-label={t(I18nKey.GIT$GITHUB_TOKEN_SEE_MORE_LINK)}
            href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token"
            target="_blank"
            className="underline underline-offset-2"
            rel="noopener noreferrer"
          />,
        ]}
      />
    </p>
  );
}

interface GitHubTokenInputProps {
  onChange: (value: string) => void;
  onGitHubHostChange: (value: string) => void;
  isGitHubTokenSet: boolean;
  name: string;
  githubHostSet: string | null | undefined;
  className?: string;
}

export function GitHubTokenInput({
  onChange,
  onGitHubHostChange,
  isGitHubTokenSet,
  name,
  githubHostSet,
  className,
}: GitHubTokenInputProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <SettingsInput
        testId={name}
        name={name}
        onChange={onChange}
        label={t(I18nKey.GITHUB$TOKEN_LABEL)}
        type="password"
        className="w-full max-w-[680px]"
        placeholder={isGitHubTokenSet ? "<hidden>" : ""}
        startContent={
          isGitHubTokenSet && (
            <KeyStatusIcon
              testId="gh-set-token-indicator"
              isSet={isGitHubTokenSet}
            />
          )
        }
      />

      <SettingsInput
        onChange={onGitHubHostChange || (() => {})}
        name="github-host-input"
        testId="github-host-input"
        label={t(I18nKey.GITHUB$HOST_LABEL)}
        type="text"
        className="w-full max-w-[680px]"
        placeholder="github.com"
        defaultValue={githubHostSet || undefined}
        startContent={
          githubHostSet &&
          githubHostSet.trim() !== "" && (
            <KeyStatusIcon testId="gh-set-host-indicator" isSet />
          )
        }
      />

      <GitHubTokenHelpAnchor />
    </div>
  );
}
