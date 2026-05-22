import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";

interface RuntimeWaitingStateProps {
  testId?: string;
}

export function RuntimeWaitingState({
  testId = "runtime-waiting",
}: RuntimeWaitingStateProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid={testId}
      className="flex h-full w-full flex-col items-center justify-center gap-3 py-8 text-center"
    >
      <LoadingSpinner size="small" />
      <Typography.Text className="text-sm text-[var(--oh-muted)]">
        {t(I18nKey.DIFF_VIEWER$WAITING_FOR_RUNTIME)}
      </Typography.Text>
    </div>
  );
}
