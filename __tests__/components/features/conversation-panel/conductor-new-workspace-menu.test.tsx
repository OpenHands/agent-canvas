import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "test-utils";
import { ConductorNewWorkspaceMenu } from "#/components/features/conversation-panel/conductor-new-workspace-menu";

describe("ConductorNewWorkspaceMenu", () => {
  it("opens the composer directly when the + button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConductorNewWorkspaceMenu />);

    await user.click(screen.getByTestId("conductor-new-workspace-button"));

    expect(
      screen.getByTestId("conductor-workspace-composer"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("conductor-workspace-composer-input"),
    ).toBeInTheDocument();
  });

  it("exposes source options inside the composer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConductorNewWorkspaceMenu />);

    await user.click(screen.getByTestId("conductor-new-workspace-button"));
    await user.click(screen.getByTestId("conductor-workspace-composer-source"));

    expect(
      screen.getByTestId("conductor-source-quick-start"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("conductor-source-open-project"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("conductor-source-open-github-project"),
    ).toBeInTheDocument();
  });

  it("opens the GitHub repository picker from the source menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConductorNewWorkspaceMenu />);

    await user.click(screen.getByTestId("conductor-new-workspace-button"));
    await user.click(screen.getByTestId("conductor-workspace-composer-source"));
    await user.click(
      screen.getByTestId("conductor-source-open-github-project"),
    );

    expect(
      screen.getByTestId("open-workspace-dialog-body"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("local-repository-form")).toBeInTheDocument();
  });
});
