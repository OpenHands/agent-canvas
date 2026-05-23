import { useTranslation } from "react-i18next";
import { RefreshCw, X } from "lucide-react";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { MODAL_ICON_BUTTON_CLASS } from "#/components/shared/modals/modal-icon-button-class";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";
import { cn } from "#/utils/utils";

interface HooksModalHeaderProps {
  isLoading: boolean;
  isRefetching: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

export function HooksModalHeader({
  isLoading,
  isRefetching,
  onRefresh,
  onClose,
}: HooksModalHeaderProps) {
  const { t } = useTranslation("openhands");
  const refreshLabel = t(I18nKey.BUTTON$REFRESH);

  return (
    <div className="flex w-full items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <BaseModalTitle title={t(I18nKey.HOOKS_MODAL$TITLE)} />
        <Typography.Text className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.HOOKS_MODAL$WARNING)}
        </Typography.Text>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StyledTooltip content={refreshLabel} placement="bottom">
          <button
            type="button"
            data-testid="refresh-hooks"
            onClick={onRefresh}
            disabled={isLoading || isRefetching}
            aria-label={refreshLabel}
            className={cn(
              MODAL_ICON_BUTTON_CLASS,
              "disabled:opacity-30 disabled:cursor-not-allowed",
            )}
          >
            <RefreshCw
              size={18}
              className={cn(isRefetching && "animate-spin")}
              aria-hidden
            />
          </button>
        </StyledTooltip>
        <button
          type="button"
          onClick={onClose}
          className={MODAL_ICON_BUTTON_CLASS}
          aria-label={t(I18nKey.BUTTON$CLOSE)}
          data-testid="close-hooks-modal"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
    </div>
  );
}
