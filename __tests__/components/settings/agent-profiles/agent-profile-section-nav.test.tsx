import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentProfileSectionNav } from "#/components/features/settings/agent-profiles/editor/agent-profile-section-nav";
import { getSectionsForKind } from "#/components/features/settings/agent-profiles/editor/sections";

describe("AgentProfileSectionNav", () => {
  const sections = getSectionsForKind("openhands");

  it("renders a button per section and marks the active one", () => {
    render(
      <AgentProfileSectionNav
        sections={sections}
        activeId="model"
        onSelect={vi.fn()}
        errorSections={new Set()}
      />,
    );
    for (const section of sections) {
      expect(
        screen.getByTestId(`agent-profile-nav-${section.id}`),
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId("agent-profile-nav-model")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows an error marker only for sections with errors", () => {
    render(
      <AgentProfileSectionNav
        sections={sections}
        activeId="overview"
        onSelect={vi.fn()}
        errorSections={new Set(["general"])}
      />,
    );
    expect(
      screen.getByTestId("agent-profile-nav-general-error"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-profile-nav-model-error"),
    ).not.toBeInTheDocument();
  });

  it("selects a section on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AgentProfileSectionNav
        sections={sections}
        activeId="overview"
        onSelect={onSelect}
        errorSections={new Set()}
      />,
    );
    await user.click(screen.getByTestId("agent-profile-nav-condenser"));
    expect(onSelect).toHaveBeenCalledWith("condenser");
  });
});
