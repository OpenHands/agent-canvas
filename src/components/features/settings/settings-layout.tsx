import { SettingsDesktopSidebar } from "./settings-desktop-sidebar";
import { SettingsNavRenderedItem } from "#/hooks/use-settings-nav-items";
import { settingsLayoutMainScrollClassName } from "#/utils/settings-like-page-layout-classes";
import { I18nKey } from "#/i18n/declaration";

interface SettingsLayoutProps {
  children: React.ReactNode;
  navigationItems: SettingsNavRenderedItem[];
  /** Heading shown above the nav (defaults to "Settings"). */
  title?: I18nKey;
}

/**
 * Mirrors the extensions layout (Skills / MCP): aside and main are siblings,
 * and only the main column scrolls so the left nav stays pinned like
 * ExtensionsNavigation. Shared by Settings and the Agents hub (#1456).
 */
export function SettingsLayout({
  children,
  navigationItems,
  title,
}: SettingsLayoutProps) {
  return (
    <div className="flex h-full flex-col md:pt-8">
      <div className="flex min-h-0 flex-1 gap-10 md:items-start">
        <SettingsDesktopSidebar
          navigationItems={navigationItems}
          title={title}
        />
        <main className={settingsLayoutMainScrollClassName}>
          <div className="mx-auto w-full min-w-0 max-w-[800px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
