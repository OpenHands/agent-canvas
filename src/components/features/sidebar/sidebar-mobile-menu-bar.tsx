import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useNavigation } from "#/context/navigation-context";
import { getMobileTopBarState } from "#/utils/mobile-section-nav";
import { SidebarMobileMenuToggle } from "./sidebar-mobile-menu-toggle";

const mobileTopBarButtonClassName = cn(
  "inline-flex h-9 w-9 items-center justify-center rounded-md",
  "text-[var(--oh-muted)] transition-colors",
  "hover:bg-[var(--oh-surface-raised)] hover:text-white",
);

export function SidebarMobileMenuBar() {
  const { t } = useTranslation("openhands");
  const { currentPath, navigate } = useNavigation();
  const topBar = getMobileTopBarState(currentPath);

  return (
    <header
      className="flex md:hidden h-12 shrink-0 items-center gap-2 px-2.5"
      aria-label={t(I18nKey.SIDEBAR$NAVIGATION_LABEL)}
    >
      <SidebarMobileMenuToggle />
      {topBar.mode === "back" && topBar.backTo ? (
        <button
          type="button"
          data-testid="sidebar-mobile-back-button"
          onClick={() => navigate(topBar.backTo!)}
          aria-label={t(topBar.backLabelKey ?? I18nKey.COMMON$BACK)}
          className={mobileTopBarButtonClassName}
        >
          <ChevronLeft width={18} height={18} aria-hidden />
        </button>
      ) : null}
    </header>
  );
}
