import { useTranslation } from "react-i18next";
import { cn } from "#/utils/utils";
import { formControlFieldClassName } from "#/utils/form-control-classes";

interface BranchErrorStateProps {
  wrapperClassName?: string;
}

export function BranchErrorState({ wrapperClassName }: BranchErrorStateProps) {
  const { t } = useTranslation("openhands");
  return (
    <div
      data-testid="branch-dropdown-error"
      className={cn(
        formControlFieldClassName,
        "flex max-w-[500px] items-center gap-2 text-red-500",
        wrapperClassName,
      )}
    >
      <span className="text-sm">{t("HOME$FAILED_TO_LOAD_BRANCHES")}</span>
    </div>
  );
}
