import React from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { AxiosError } from "axios";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { formControlSettingsFieldClassName } from "#/utils/form-control-classes";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

const ENV_VAR_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

interface AcpEnvSettingsProps {
  envKeys: string[];
}

export function AcpEnvSettings({ envKeys }: AcpEnvSettingsProps) {
  const { t } = useTranslation("openhands");
  const { mutate: saveSettings, isPending } = useSaveSettings();
  const [name, setName] = React.useState("");
  const [value, setValue] = React.useState("");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);

  const sortedKeys = React.useMemo(
    () => [...envKeys].sort((a, b) => a.localeCompare(b)),
    [envKeys],
  );

  const validateNewName = (trimmed: string): string | null => {
    if (!ENV_VAR_NAME_PATTERN.test(trimmed)) {
      return t(I18nKey.SETTINGS$AGENT_ENV_NAME_INVALID);
    }
    if (envKeys.includes(trimmed)) {
      return t(I18nKey.SETTINGS$AGENT_ENV_NAME_DUPLICATE);
    }
    return null;
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const error = validateNewName(trimmed);
    if (error) {
      setAddError(error);
      return;
    }
    setAddError(null);
    saveSettings(
      { agent_settings_diff: { acp_env: { [trimmed]: value } } },
      {
        onError: (err) => {
          const message = retrieveAxiosErrorMessage(err as AxiosError);
          displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
        },
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
          setName("");
          setValue("");
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    const key = pendingDelete;
    // Soft-delete: write an empty string. The generic ``PATCH /api/settings``
    // deep-merge has no "unset" primitive for inner dict-value entries —
    // sending ``null`` would fail validation against ``acp_env: dict[str, str]``
    // (which is why the running v1.24.0 agent-server 422s). Empty string
    // passes validation and is treated as "not set" by every credential CLI
    // we ship against today (Claude Code, codex-acp, gemini-cli), and the
    // display path below filters empty-string entries out of the list so
    // they look gone in the UI.
    //
    // The trade-off: ``settings.json`` accumulates zombie empty entries
    // until a real delete primitive lands. Swap to dedicated CRUD via
    // ``/api/settings/agent-env`` (software-agent-sdk#3420) once the
    // backend ships them.
    saveSettings(
      { agent_settings_diff: { acp_env: { [key]: "" } } },
      {
        onError: (err) => {
          const message = retrieveAxiosErrorMessage(err as AxiosError);
          displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
        },
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
        },
        onSettled: () => setPendingDelete(null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-2" data-testid="acp-env-settings">
      <Typography.Text className="text-sm font-medium">
        {t(I18nKey.SETTINGS$AGENT_ENV_TITLE)}
      </Typography.Text>
      <Typography.Text className="text-xs text-tertiary-light">
        {t(I18nKey.SETTINGS$AGENT_ENV_DESCRIPTION)}
      </Typography.Text>

      {sortedKeys.length > 0 ? (
        <ul className="flex flex-col mt-1" data-testid="acp-env-list">
          {sortedKeys.map((key) => (
            <li
              key={key}
              data-testid={`acp-env-row-${key}`}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-[var(--oh-border)] last:border-b-0"
            >
              <code className="text-sm font-mono text-white truncate min-w-0">
                {key}
              </code>
              <button
                type="button"
                data-testid={`acp-env-delete-${key}`}
                onClick={() => setPendingDelete(key)}
                aria-label={`Delete ${key}`}
                disabled={isPending}
                className="text-tertiary-light hover:text-red-400 disabled:opacity-50 p-1 shrink-0"
              >
                <Trash2 aria-hidden className="size-4" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p
          data-testid="acp-env-empty"
          className="text-xs italic text-tertiary-light mt-1"
        >
          {t(I18nKey.SETTINGS$AGENT_ENV_EMPTY)}
        </p>
      )}

      <form
        onSubmit={handleAdd}
        data-testid="acp-env-add-form"
        className="flex items-stretch gap-2 mt-1"
      >
        <input
          data-testid="acp-env-name-input"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (addError) setAddError(null);
          }}
          placeholder={t(I18nKey.SETTINGS$AGENT_ENV_NAME_PLACEHOLDER)}
          required
          disabled={isPending}
          className={cn(formControlSettingsFieldClassName, "flex-1 min-w-0")}
        />
        <input
          data-testid="acp-env-value-input"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t(I18nKey.SETTINGS$AGENT_ENV_VALUE_PLACEHOLDER)}
          required
          disabled={isPending}
          className={cn(formControlSettingsFieldClassName, "flex-1 min-w-0")}
        />
        <BrandButton
          testId="acp-env-add-button"
          type="submit"
          variant="primary"
          isDisabled={isPending || !name.trim() || !value}
        >
          {t(I18nKey.SETTINGS$AGENT_ENV_ADD)}
        </BrandButton>
      </form>
      {addError && (
        <p
          role="alert"
          data-testid="acp-env-add-error"
          className="text-xs text-red-400"
        >
          {addError}
        </p>
      )}

      {pendingDelete && (
        <ConfirmationModal
          text={t(I18nKey.SETTINGS$AGENT_ENV_CONFIRM_DELETE, {
            name: pendingDelete,
          })}
          onConfirm={handleConfirmDelete}
          onCancel={() => {
            if (isPending) return;
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
}
