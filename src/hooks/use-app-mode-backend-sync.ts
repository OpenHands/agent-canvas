import React from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useNavigation } from "#/context/navigation-context";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useWorkModeCapabilityContext } from "#/hooks/use-work-mode-availability";
import { I18nKey } from "#/i18n/declaration";
import { useAppModeStore } from "#/stores/app-mode-store";
import {
  canUseWorkMode,
  getEffectiveAppMode,
} from "#/utils/app-mode-capabilities";
import { isWorkModePath } from "#/utils/app-mode";
import { TOAST_OPTIONS } from "#/utils/custom-toast-handlers";
import { calculateToastDuration } from "#/utils/toast-duration";

/**
 * Keeps app mode consistent with backend Work capabilities. Defaults disable
 * Work on cloud until `backend.workExecution` is set to `local` or `hosted`.
 *
 * @spec WM-003 — Backend/mode sync
 */
export function useAppModeBackendSync() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const capabilityContext = useWorkModeCapabilityContext();
  const { navigate, currentPath } = useNavigation();
  const mode = useAppModeStore((state) => state.mode);
  const setMode = useAppModeStore((state) => state.setMode);
  const lastBackendIdRef = React.useRef(backend.id);

  React.useEffect(() => {
    const workAllowed = canUseWorkMode(capabilityContext);
    const effectiveMode = getEffectiveAppMode(mode, capabilityContext);
    const backendChanged = lastBackendIdRef.current !== backend.id;
    lastBackendIdRef.current = backend.id;

    if (effectiveMode === mode) {
      return;
    }

    setMode("code");

    if (mode === "work") {
      const message = t(I18nKey.APP_MODE$WORK_CLOUD_FALLBACK);
      toast(message, {
        ...TOAST_OPTIONS,
        duration: calculateToastDuration(message, 5000),
      });
    }

    if (isWorkModePath(currentPath)) {
      navigate("/conversations", { replace: true });
    } else if (backendChanged && !workAllowed) {
      // No navigation needed when already on code routes.
    }
  }, [backend.id, capabilityContext, currentPath, mode, navigate, setMode, t]);
}
