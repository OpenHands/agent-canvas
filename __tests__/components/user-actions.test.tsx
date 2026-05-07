import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { UserActions } from "#/components/features/sidebar/user-actions";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

vi.mock("#/hooks/use-settings-nav-items", () => ({
  useSettingsNavItems: () => [
    { type: "item", item: OSS_NAV_ITEMS[0] },
    { type: "item", item: OSS_NAV_ITEMS[6] },
  ],
}));

function renderUserActions() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ActiveBackendProvider>
          <UserActions
            user={{ avatar_url: "https://example.com/avatar.png" }}
          />
        </ActiveBackendProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("UserActions", () => {
  it("shows the OSS user menu on hover without hosted-only actions", async () => {
    const user = userEvent.setup();
    renderUserActions();

    await user.hover(screen.getByTestId("user-actions"));

    expect(screen.getByTestId("user-context-menu")).toBeVisible();
    expect(screen.getByTestId("backend-selector")).toBeInTheDocument();
    expect(screen.getByTestId("add-backend-menu-item")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS$NAV_LLM")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS$NAV_APPLICATION")).toBeInTheDocument();
    expect(screen.getByText("SIDEBAR$DOCS")).toBeInTheDocument();
    expect(
      screen.queryByText("ACCOUNT_SETTINGS$LOGOUT"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("context-menu-cta")).not.toBeInTheDocument();
  });

  it("opens the Add Backend modal and hides the context menu when 'Add Backend' is clicked", async () => {
    const user = userEvent.setup();
    renderUserActions();

    await user.hover(screen.getByTestId("user-actions"));
    await user.click(screen.getByTestId("add-backend-menu-item"));

    expect(screen.getByTestId("add-backend-modal")).toBeInTheDocument();

    // While the modal is open, the menu wrapper must lose BOTH the
    // explicit visibility classes AND the `group-hover:*` classes — the
    // latter is what was keeping the menu visible even after the menu
    // state was closed.
    const wrapper = screen.getByTestId("user-context-menu-wrapper");
    expect(wrapper.className).not.toMatch(/(?:^|\s)opacity-100(?:\s|$)/);
    expect(wrapper.className).not.toMatch(
      /(?:^|\s)pointer-events-auto(?:\s|$)/,
    );
    expect(wrapper.className).not.toContain("group-hover:opacity-100");
    expect(wrapper.className).not.toContain("group-hover:pointer-events-auto");
  });

  it("survives extraneous keypresses while the modal is open (Escape does not close it)", async () => {
    const user = userEvent.setup();
    renderUserActions();

    await user.hover(screen.getByTestId("user-actions"));
    await user.click(screen.getByTestId("add-backend-menu-item"));

    expect(screen.getByTestId("add-backend-modal")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByTestId("add-backend-modal")).toBeInTheDocument();
  });
});
