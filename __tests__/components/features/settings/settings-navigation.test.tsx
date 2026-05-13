import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { SettingsNavigation } from "#/components/features/settings/settings-navigation";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { SettingsNavRenderedItem } from "#/hooks/use-settings-nav-items";

const llmItem = OSS_NAV_ITEMS.find((item) => item.to === "/settings")!;
const condenserItem = OSS_NAV_ITEMS.find(
  (item) => item.to === "/settings/condenser",
)!;

const baseItems: SettingsNavRenderedItem[] = [
  { type: "header", text: "SETTINGS$TITLE" as never },
  { type: "item", item: llmItem },
  { type: "divider" },
  { type: "item", item: condenserItem },
];

describe("SettingsNavigation", () => {
  it("renders the provided OSS navigation items, headers, and dividers", () => {
    render(
      <MemoryRouter>
        <SettingsNavigation
          isMobileMenuOpen={false}
          onCloseMobileMenu={vi.fn()}
          navigationItems={baseItems}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("settings-navbar")).toBeInTheDocument();
    expect(screen.getAllByText("SETTINGS$TITLE").length).toBeGreaterThan(0);
    expect(screen.getByText("SETTINGS$NAV_LLM")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS$NAV_CONDENSER")).toBeInTheDocument();
  });

  it("closes the mobile drawer when the close button is clicked", async () => {
    const onCloseMobileMenu = vi.fn();
    render(
      <MemoryRouter>
        <SettingsNavigation
          isMobileMenuOpen
          onCloseMobileMenu={onCloseMobileMenu}
          navigationItems={baseItems}
        />
      </MemoryRouter>,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /close navigation menu/i }),
    );

    expect(onCloseMobileMenu).toHaveBeenCalledTimes(1);
  });

  it("closes the mobile drawer after a navigation item is selected", async () => {
    const onCloseMobileMenu = vi.fn();
    render(
      <MemoryRouter>
        <SettingsNavigation
          isMobileMenuOpen
          onCloseMobileMenu={onCloseMobileMenu}
          navigationItems={baseItems}
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByText("SETTINGS$NAV_LLM"));

    expect(onCloseMobileMenu).toHaveBeenCalledTimes(1);
  });
});
