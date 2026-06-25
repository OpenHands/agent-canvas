import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppModeToggle } from "#/components/features/sidebar/app-mode-toggle";
import { useAppModeStore } from "#/stores/app-mode-store";

const navigate = vi.fn();

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    navigate,
    currentPath: "/conversations",
  }),
}));

const localCapabilityContext = {
  backendKind: "local" as const,
  hasLocalBackend: true,
};

vi.mock("#/hooks/use-work-mode-availability", () => ({
  useWorkModeAvailability: vi.fn(() => ({
    workAllowed: true,
    workExecution: "local",
    hasLocalBackend: true,
    backendKind: "local",
    capabilityContext: localCapabilityContext,
  })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("#/components/shared/buttons/styled-tooltip", () => ({
  StyledTooltip: ({ children }: { children: React.ReactNode }) => children,
}));

import { useWorkModeAvailability } from "#/hooks/use-work-mode-availability";

describe("AppModeToggle", () => {
  beforeEach(() => {
    navigate.mockClear();
    useAppModeStore.setState({ mode: "code" });
    vi.mocked(useWorkModeAvailability).mockReturnValue({
      workAllowed: true,
      workExecution: "local",
      hasLocalBackend: true,
      backendKind: "local",
      capabilityContext: localCapabilityContext,
    });
  });

  it("is hidden when the sidebar is collapsed", () => {
    render(<AppModeToggle collapsed />);
    expect(screen.queryByTestId("app-mode-toggle")).not.toBeInTheDocument();
  });

  it("switches to work mode and navigates home on local backends", () => {
    render(<AppModeToggle collapsed={false} />);

    fireEvent.click(screen.getByTestId("app-mode-toggle-option-work"));

    expect(useAppModeStore.getState().mode).toBe("work");
    expect(navigate).toHaveBeenCalledWith("/work");
  });

  it("disables work on cloud backends", () => {
    vi.mocked(useWorkModeAvailability).mockReturnValue({
      workAllowed: false,
      workExecution: "none",
      hasLocalBackend: true,
      backendKind: "cloud",
      capabilityContext: {
        backendKind: "cloud",
        hasLocalBackend: true,
      },
    });

    render(<AppModeToggle collapsed={false} />);

    expect(screen.getByTestId("app-mode-toggle-option-work")).toBeDisabled();
    fireEvent.click(screen.getByTestId("app-mode-toggle-option-work"));
    expect(useAppModeStore.getState().mode).toBe("code");
    expect(navigate).not.toHaveBeenCalled();
  });
});
