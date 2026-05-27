import { useTranslation } from "react-i18next";
import { Spinner } from "@heroui/react";
import { cn } from "#/utils/utils";
import { formControlFieldClassName } from "#/utils/form-control-classes";

interface BranchLoadingStateProps {
  wrapperClassName?: string;
}

export function BranchLoadingState({
  wrapperClassName,
}: BranchLoadingStateProps) {
  const { t } = useTranslation("openhands");
  return (
    <div
      data-testid="branch-dropdown-loading"
      className={cn(
        formControlFieldClassName,
        "flex max-w-[500px] items-center gap-2",
        wrapperClassName,
      )}
    >
      <Spinner size="sm" />
      <span className="text-sm">{t("HOME$LOADING_BRANCHES")}</span>
    </div>
  );
}
