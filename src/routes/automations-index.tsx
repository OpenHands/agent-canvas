import { Navigate } from "react-router";
import { useBreakpoint } from "#/hooks/use-breakpoint";
import { AutomationsMobileHub } from "#/components/features/automations/automations-mobile-hub";

export default function AutomationsIndex() {
  const isMobile = useBreakpoint(768);

  if (isMobile) {
    return <AutomationsMobileHub />;
  }

  return <Navigate to="/automations/dashboard" replace />;
}
