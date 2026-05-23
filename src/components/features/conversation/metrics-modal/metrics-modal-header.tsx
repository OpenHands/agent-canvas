import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { MODAL_ICON_BUTTON_CLASS } from "#/components/shared/modals/modal-icon-button-class";
import { I18nKey } from "#/i18n/declaration";

interface MetricsModalHeaderProps {
  onClose: () => void;
}

export function MetricsModalHeader({ onClose }: MetricsModalHeaderProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex w-full items-start justify-between gap-4">
      <BaseModalTitle title={t(I18nKey.CONVERSATION$METRICS_INFO)} />
      <button
        type="button"
        onClick={onClose}
        className={MODAL_ICON_BUTTON_CLASS}
        aria-label={t(I18nKey.BUTTON$CLOSE)}
        data-testid="close-metrics-modal"
      >
        <X size={20} aria-hidden />
      </button>
    </div>
  );
}
