import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";

interface WaitingForRuntimeMessageProps {
  className?: string;
  testId?: string;
}

export function WaitingForRuntimeMessage({
  className,
  testId,
}: WaitingForRuntimeMessageProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid={testId}
      className={cn(
        "w-full h-full flex items-center text-center justify-center text-2xl text-foreground",
        className,
      )}
    >
      {t("DIFF_VIEWER$WAITING_FOR_RUNTIME")}
    </div>
  );
}
