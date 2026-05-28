import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Trash2 } from "lucide-react";
import { AxiosError } from "axios";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  settingsListIconActionButtonClassName,
  settingsListScrollContainerClassName,
  settingsListTableCellClassName,
  settingsListTableHeadClassName,
  settingsListTableHeaderCellClassName,
  settingsListTableRowClassName,
} from "#/utils/settings-list-classes";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { AcpEnvForm } from "./acp-env-form";

interface AcpEnvSettingsProps {
  /** Names of env vars already configured on the server. Values are not
   * surfaced — the server redacts them on GET, and the editor never
   * round-trips existing values. */
  envKeys: string[];
}

export function AcpEnvSettings({ envKeys }: AcpEnvSettingsProps) {
  const { t } = useTranslation("openhands");
  const [view, setView] = React.useState<"list" | "form">("list");
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const { mutate: saveSettings, isPending } = useSaveSettings();

  const sortedKeys = React.useMemo(
    () => [...envKeys].sort((a, b) => a.localeCompare(b)),
    [envKeys],
  );

  const handleConfirmDelete = () => {
    if (!pendingDelete) return;
    const name = pendingDelete;
    saveSettings(
      // null is the documented "delete this key" signal handled by the
      // agent-server's PersistedSettings.update pre-processor.
      { agent_settings_diff: { acp_env: { [name]: null } } },
      {
        onError: (err) => {
          const message = retrieveAxiosErrorMessage(err as AxiosError);
          displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
        },
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
        },
        onSettled: () => {
          setPendingDelete(null);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4" data-testid="acp-env-settings">
      {view === "list" ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Typography.Text className="text-sm font-medium">
                {t(I18nKey.SETTINGS$AGENT_ENV_TITLE)}
              </Typography.Text>
              <Typography.Text className="block text-xs text-[#717888]">
                {t(I18nKey.SETTINGS$AGENT_ENV_DESCRIPTION)}
              </Typography.Text>
            </div>
            <BrandButton
              testId="acp-env-add-button"
              type="button"
              variant="primary"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setView("form")}
            >
              {t(I18nKey.SETTINGS$AGENT_ENV_ADD_NEW)}
            </BrandButton>
          </div>

          {sortedKeys.length === 0 ? (
            <Typography.Text
              className="text-xs text-[#717888] italic"
              testId="acp-env-empty"
            >
              {t(I18nKey.SETTINGS$AGENT_ENV_EMPTY)}
            </Typography.Text>
          ) : (
            <div className={settingsListScrollContainerClassName}>
              <table className="w-full min-w-full table-fixed">
                <thead className={settingsListTableHeadClassName}>
                  <tr>
                    <th
                      className={cn(
                        settingsListTableHeaderCellClassName,
                        "w-3/4",
                      )}
                    >
                      {t(I18nKey.SETTINGS$NAME)}
                    </th>
                    <th
                      className={cn(
                        settingsListTableHeaderCellClassName,
                        "w-1/4 text-right",
                      )}
                    >
                      {t(I18nKey.SETTINGS$ACTIONS)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedKeys.map((name) => (
                    <tr
                      key={name}
                      data-testid={`acp-env-row-${name}`}
                      className={settingsListTableRowClassName}
                    >
                      <td
                        className={cn(
                          settingsListTableCellClassName,
                          "text-content-2 truncate font-mono",
                        )}
                        title={name}
                      >
                        {name}
                      </td>
                      <td className={settingsListTableCellClassName}>
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            data-testid={`acp-env-delete-${name}`}
                            type="button"
                            onClick={() => setPendingDelete(name)}
                            aria-label={`Delete ${name}`}
                            className={settingsListIconActionButtonClassName}
                          >
                            <Trash2
                              aria-hidden
                              className="size-4"
                              strokeWidth={2}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setView("list")}
            className="flex items-center gap-2 self-start rounded-lg p-2 text-[var(--oh-muted)] transition-colors hover:bg-tertiary hover:text-white"
            data-testid="acp-env-back"
          >
            <ArrowLeft size={20} aria-hidden />
            <span className="text-sm leading-5">{t(I18nKey.BUTTON$BACK)}</span>
          </button>
          <Typography.H3>{t(I18nKey.SETTINGS$AGENT_ENV_ADD_NEW)}</Typography.H3>
          <AcpEnvForm
            existingKeys={envKeys}
            onSaved={() => setView("list")}
            onCancel={() => setView("list")}
          />
        </div>
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
