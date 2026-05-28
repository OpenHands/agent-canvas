import React from "react";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

const ENV_VAR_NAME_PATTERN = "^[a-zA-Z][a-zA-Z0-9_]{0,63}$";

interface AcpEnvFormProps {
  existingKeys: string[];
  onSaved: () => void;
  onCancel: () => void;
}

export function AcpEnvForm({
  existingKeys,
  onSaved,
  onCancel,
}: AcpEnvFormProps) {
  const { t } = useTranslation("openhands");
  const { mutate: saveSettings, isPending } = useSaveSettings();
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = (formData.get("acp-env-name") ?? "").toString().trim();
    const value = (formData.get("acp-env-value") ?? "").toString();

    if (existingKeys.includes(name)) {
      setError(t(I18nKey.SETTINGS$AGENT_ENV_NAME_DUPLICATE));
      return;
    }
    setError(null);

    saveSettings(
      { agent_settings_diff: { acp_env: { [name]: value } } },
      {
        onError: (err) => {
          const message = retrieveAxiosErrorMessage(err as AxiosError);
          displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
        },
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
          onSaved();
        },
      },
    );
  };

  return (
    <form
      data-testid="acp-env-form"
      onSubmit={handleSubmit}
      className="flex flex-col items-start gap-6"
    >
      <SettingsInput
        testId="acp-env-name-input"
        name="acp-env-name"
        type="text"
        label={t(I18nKey.SETTINGS$NAME)}
        className="w-full min-w-0"
        required
        placeholder="ANTHROPIC_API_KEY"
        pattern={ENV_VAR_NAME_PATTERN}
        title={t(I18nKey.SETTINGS$AGENT_ENV_NAME_INVALID)}
      />
      {error && (
        <p
          role="alert"
          data-testid="acp-env-form-error"
          className="text-red-500 text-sm -mt-4"
        >
          {error}
        </p>
      )}
      <SettingsInput
        testId="acp-env-value-input"
        name="acp-env-value"
        type="password"
        label={t(I18nKey.FORM$VALUE)}
        className="w-full min-w-0"
        required
      />
      <div className="flex items-center gap-4">
        <BrandButton
          testId="acp-env-cancel-button"
          type="button"
          variant="secondary"
          onClick={onCancel}
          isDisabled={isPending}
        >
          {t(I18nKey.BUTTON$CANCEL)}
        </BrandButton>
        <BrandButton
          testId="acp-env-submit-button"
          type="submit"
          variant="primary"
          isDisabled={isPending}
          aria-busy={isPending}
        >
          {t(I18nKey.SETTINGS$AGENT_ENV_ADD)}
        </BrandButton>
      </div>
    </form>
  );
}
