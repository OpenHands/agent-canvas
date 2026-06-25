import { useTranslation } from "react-i18next";
import { CustomChatInput } from "#/components/features/chat/custom-chat-input";
import { WorkModeCloudGuard } from "#/components/features/work/work-mode-cloud-guard";
import { I18nKey } from "#/i18n/declaration";

export function WorkHomeScreen() {
  const { t } = useTranslation("openhands");

  return (
    <div
      data-testid="work-home-screen"
      className="custom-scrollbar-always flex h-full flex-col overflow-y-auto rounded-xl bg-transparent px-4 md:px-0 lg:px-[42px]"
    >
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center">
        <div className="flex w-full max-w-[800px] flex-col gap-4 md:px-4">
          <WorkModeCloudGuard />
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-medium text-foreground">
              {t(I18nKey.WORK$HOME_TITLE)}
            </h1>
            <p className="text-sm text-tertiary-light">
              {t(I18nKey.WORK$HOME_DESCRIPTION)}
            </p>
          </div>

          <CustomChatInput onSubmit={() => {}} disabled />

          <p className="text-center text-xs text-tertiary-light">
            {t(I18nKey.WORK$SCAFFOLD_NOTICE)}
          </p>
        </div>
      </div>
    </div>
  );
}
