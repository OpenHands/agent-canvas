import { Outlet } from "react-router";
import { AutomationsNavigation } from "#/components/features/automations/automations-navigation";
import { cn } from "#/utils/utils";
import { settingsLikeMainScrollClassName } from "#/utils/settings-like-page-layout-classes";

export default function AutomationsLayout() {
  return (
    <div
      data-testid="automations-layout-screen"
      className="flex h-full gap-4 md:gap-6 md:pl-8 lg:gap-10 lg:pl-10"
    >
      <AutomationsNavigation />
      <main className={cn(settingsLikeMainScrollClassName, "h-full w-full")}>
        <div className="mx-auto flex w-full min-w-0 max-w-[800px] flex-col gap-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
