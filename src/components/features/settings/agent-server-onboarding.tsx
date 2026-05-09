import React from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getAgentServerFormDefaults,
  saveAgentServerConfig,
} from "#/api/agent-server-config";
import { cn } from "#/utils/utils";
import { BrandButton } from "./brand-button";
import { SettingsInput } from "./settings-input";

type AgentServerConnectionFormVariant = "settings" | "onboarding";

interface AgentServerConnectionFormProps {
  className?: string;
  formClassName?: string;
  variant?: AgentServerConnectionFormVariant;
  showSectionHeader?: boolean;
}

export function AgentServerConnectionForm({
  className,
  formClassName,
  variant = "onboarding",
  showSectionHeader,
}: AgentServerConnectionFormProps) {
  const { t } = useTranslation("openhands");
  const defaults = React.useMemo(() => getAgentServerFormDefaults(), []);
  const [baseUrl, setBaseUrl] = React.useState(defaults.baseUrl);
  const [sessionApiKey, setSessionApiKey] = React.useState(
    defaults.sessionApiKey,
  );

  const formIsClean =
    baseUrl === defaults.baseUrl && sessionApiKey === defaults.sessionApiKey;
  const isOnboarding = variant === "onboarding";
  const shouldShowSectionHeader = showSectionHeader ?? isOnboarding;

  const reconnect = () => {
    window.location.assign("/");
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    saveAgentServerConfig({
      baseUrl,
      sessionApiKey,
    });

    reconnect();
  };

  return (
    <form
      data-testid="agent-server-connection-form"
      onSubmit={onSubmit}
      className={cn("flex h-full flex-col", className)}
    >
      <div
        className={cn(
          "flex flex-col gap-5",
          isOnboarding &&
            "rounded-3xl border border-white/10 bg-neutral-950/80 p-6 shadow-2xl",
          formClassName,
        )}
      >
        {shouldShowSectionHeader ? (
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary">
              {t("SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_TITLE")}
            </p>
            <p className="mt-3 max-w-[680px] text-sm leading-7 text-gray-400">
              {t("SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_DESCRIPTION")}
            </p>
          </div>
        ) : null}

        <SettingsInput
          testId="agent-server-url-input"
          name="agent-server-url-input"
          type="text"
          label={t("SETTINGS$AGENT_SERVER_URL")}
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder={t("SETTINGS$AGENT_SERVER_URL_PLACEHOLDER")}
          className="w-full max-w-[680px]"
        />

        <SettingsInput
          testId="agent-server-api-key-input"
          name="agent-server-api-key-input"
          type="password"
          label={t("SETTINGS$AGENT_SERVER_API_KEY")}
          value={sessionApiKey}
          onChange={setSessionApiKey}
          placeholder={t("SETTINGS$AGENT_SERVER_API_KEY_PLACEHOLDER")}
          showOptionalTag
          className="w-full max-w-[680px]"
        />

        <p className="max-w-[680px] text-xs leading-6 text-gray-500">
          {t("SETTINGS$AGENT_SERVER_BROWSER_ONLY_NOTE")}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <BrandButton
          testId="retry-connection-button"
          variant="secondary"
          type="button"
          onClick={reconnect}
          startContent={<RefreshCw className="size-4" />}
        >
          {t("SETTINGS$AGENT_SERVER_RETRY_CONNECTION")}
        </BrandButton>
        <BrandButton
          testId="submit-button"
          variant="primary"
          type="submit"
          isDisabled={formIsClean}
        >
          {t("SETTINGS$SAVE_AND_RECONNECT")}
        </BrandButton>
      </div>
    </form>
  );
}
