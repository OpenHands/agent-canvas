import { useTranslation } from "react-i18next";
import { Typography } from "#/ui/typography";

export function HomeHeaderTitle() {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex h-[80px] w-full items-center justify-center">
      <Typography.H1 className="w-full text-center">
        {t("HOME$LETS_START_BUILDING")}
      </Typography.H1>
    </div>
  );
}
