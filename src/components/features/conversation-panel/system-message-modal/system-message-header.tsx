import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";

interface SystemMessageHeaderProps {
  agentClass: string | null;
  openhandsVersion: string | null;
  onClose: () => void;
}

const ICON_BUTTON_CLASS =
  "rounded-md p-1 text-white hover:bg-tertiary cursor-pointer";

export function SystemMessageHeader({
  agentClass,
  openhandsVersion,
  onClose,
}: SystemMessageHeaderProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex w-full items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <BaseModalTitle title={t(I18nKey.SYSTEM_MESSAGE_MODAL$TITLE)} />
        {(agentClass || openhandsVersion) && (
          <div className="flex flex-col gap-2">
            {agentClass && (
              <div className="text-sm">
                <Typography.Text className="font-semibold text-[var(--oh-text-tertiary)]">
                  {t(I18nKey.SYSTEM_MESSAGE_MODAL$AGENT_CLASS)}
                </Typography.Text>{" "}
                <Typography.Text className="font-medium text-content-2">
                  {agentClass}
                </Typography.Text>
              </div>
            )}
            {openhandsVersion && (
              <div className="text-sm">
                <Typography.Text className="font-semibold text-[var(--oh-text-tertiary)]">
                  {t(I18nKey.SYSTEM_MESSAGE_MODAL$OPENHANDS_VERSION)}
                </Typography.Text>{" "}
                <Typography.Text className="text-content-2">
                  {openhandsVersion}
                </Typography.Text>
              </div>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className={ICON_BUTTON_CLASS}
        aria-label={t(I18nKey.BUTTON$CLOSE)}
        data-testid="close-system-message-modal"
      >
        <X size={20} aria-hidden />
      </button>
    </div>
  );
}
