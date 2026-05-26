import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

type ConversationLoadingProps = {
  className?: string;
};

export function ConversationLoading({ className }: ConversationLoadingProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      className={cn(
        "bg-[var(--oh-surface)] flex h-full w-full flex-col items-center justify-center gap-3",
        className,
      )}
    >
      <LoaderCircle
        className="h-8 w-8 shrink-0 animate-spin text-[var(--oh-text-secondary)]"
        aria-hidden
      />
      <span className="text-base font-normal leading-5 text-[var(--oh-text-secondary)]">
        {t(I18nKey.HOME$LOADING)}
      </span>
    </div>
  );
}
