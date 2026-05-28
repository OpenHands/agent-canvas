import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";

interface UpgradeButtonProps {
  onClick?: () => void;
  className?: string;
  isDisabled?: boolean;
}

export function UpgradeButton({
  onClick,
  className,
  isDisabled,
}: UpgradeButtonProps) {
  const { t } = useTranslation("openhands");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        "bg-[var(--oh-interactive-selected)] text-white text-[9px] font-normal w-16 h-4 rounded-[100px] mix-blend-multiply hover:opacity-80 transition-opacity cursor-pointer",
        className,
      )}
    >
      {t("SETTINGS$UPGRADE_BUTTON")}
    </button>
  );
}
