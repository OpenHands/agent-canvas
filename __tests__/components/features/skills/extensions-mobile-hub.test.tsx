import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { ExtensionsMobileHub } from "#/components/features/skills/extensions-mobile-hub";

function renderMobileHub(ui: ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ActiveBackendProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

describe("ExtensionsMobileHub", () => {
  it("renders the Plugins item as an enabled link", () => {
    renderMobileHub(<ExtensionsMobileHub />);

    const hub = screen.getByTestId("extensions-mobile-hub");
    const pluginsItem = within(hub).getByTestId("sidebar-extensions-/plugins");
    expect(pluginsItem).not.toHaveAttribute("aria-disabled");
  });
});
