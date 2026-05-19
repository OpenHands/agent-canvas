import { ChevronLeft, PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useNavigation } from "#/context/navigation-context";
import { useSidebarMobileNav } from "./sidebar-mobile-nav-context";
import { getMobileTopBarState } from "#/utils/mobile-section-nav";

const mobileTopBarButtonClassName = cn(
  "inline-flex h-9 w-9 items-center justify-center rounded-md",
  "text-[var(--oh-muted)] transition-colors",
  "hover:bg-[var(--oh-surface-raised)] hover:text-white",
);

export function SidebarMobileMenuBar() {
  const { t } = useTranslation("openhands");
  const { isOpen, toggle } = useSidebarMobileNav();
  const { currentPath, navigate } = useNavigation();
  const topBar = getMobileTopBarState(currentPath);

  const menuToggle = (
    <button
      type="button"
      data-testid="sidebar-mobile-menu-toggle"
      onClick={toggle}
      aria-expanded={isOpen}
      aria-label={
        isOpen ? t(I18nKey.SIDEBAR$CLOSE_MENU) : t(I18nKey.SIDEBAR$OPEN_MENU)
      }
      className={mobileTopBarButtonClassName}
    >
      <PanelLeft width={18} height={18} aria-hidden />
    </button>
  );

  return (
    <header
      className="flex md:hidden h-12 shrink-0 items-center gap-2 px-2"
      aria-label={t(I18nKey.SIDEBAR$NAVIGATION_LABEL)}
    >
      {menuToggle}
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
