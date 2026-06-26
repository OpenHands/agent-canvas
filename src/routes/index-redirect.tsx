import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAppModeStore } from "#/stores/app-mode-store";
import { useWorkModeCapabilityContext } from "#/hooks/use-work-mode-availability";
import { getEffectiveHomePath } from "#/utils/app-mode-capabilities";

export default function IndexRedirect() {
  const navigate = useNavigate();
  const mode = useAppModeStore((state) => state.mode);
  const capabilityContext = useWorkModeCapabilityContext();

  useEffect(() => {
    navigate(getEffectiveHomePath(mode, capabilityContext), { replace: true });
  }, [mode, capabilityContext, navigate]);

  return null;
}
