import { useTranslation } from "react-i18next";
import { useNavigation } from "#/context/navigation-context";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useWorkModeAvailability } from "#/hooks/use-work-mode-availability";
import { I18nKey } from "#/i18n/declaration";
import { useAppModeStore } from "#/stores/app-mode-store";
import { BrandButton } from "#/components/features/settings/brand-button";

export function WorkModeCloudGuard() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { workAllowed, hasLocalBackend } = useWorkModeAvailability();
  const { setActive, backends } = useActiveBackendContext();
  const setMode = useAppModeStore((state) => state.setMode);

  if (workAllowed) {
    return null;
  }

  const switchToLocalBackend = () => {
    const localBackend = backends.find((entry) => entry.kind === "local");
    if (!localBackend) {
      return;
    }
    setActive(localBackend.id, null);
    setMode("work");
    navigate("/work");
  };

  return (
    <div
      data-testid="work-mode-cloud-guard"
      className="mb-4 rounded-lg border border-[var(--oh-border-input)] bg-[var(--oh-surface-raised)] px-4 py-3 text-sm text-tertiary-light"
    >
      <p className="font-medium text-foreground">
        {t(I18nKey.WORK$CLOUD_UNAVAILABLE_TITLE)}
      </p>
      <p className="mt-1">{t(I18nKey.WORK$CLOUD_UNAVAILABLE_BODY)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {hasLocalBackend ? (
          <BrandButton
            type="button"
            variant="primary"
            testId="work-mode-switch-local-backend"
            onClick={switchToLocalBackend}
          >
            {t(I18nKey.WORK$CLOUD_SWITCH_LOCAL)}
          </BrandButton>
        ) : null}
        <BrandButton
          type="button"
          variant={hasLocalBackend ? "secondary" : "primary"}
          testId="work-mode-back-to-code"
          onClick={() => {
            setMode("code");
            navigate("/conversations");
          }}
        >
          {t(I18nKey.WORK$CLOUD_BACK_TO_CODE)}
        </BrandButton>
      </div>
    </div>
  );
}
