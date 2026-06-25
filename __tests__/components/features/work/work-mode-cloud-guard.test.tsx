import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkModeCloudGuard } from "#/components/features/work/work-mode-cloud-guard";
import { useAppModeStore } from "#/stores/app-mode-store";

const navigate = vi.fn();
const setActive = vi.fn();

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({ navigate }),
}));

vi.mock("#/hooks/use-work-mode-availability", () => ({
  useWorkModeAvailability: vi.fn(),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackendContext: () => ({
    setActive,
    backends: [
      { id: "local-1", name: "Local", kind: "local", host: "http://localhost", apiKey: "k" },
      { id: "cloud-1", name: "Cloud", kind: "cloud", host: "https://cloud", apiKey: "k" },
    ],
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { useWorkModeAvailability } from "#/hooks/use-work-mode-availability";

describe("WorkModeCloudGuard", () => {
  beforeEach(() => {
    navigate.mockClear();
    setActive.mockClear();
    useAppModeStore.setState({ mode: "work" });
  });

  it("renders nothing when work is allowed", () => {
    vi.mocked(useWorkModeAvailability).mockReturnValue({
      workAllowed: true,
      workExecution: "local",
      hasLocalBackend: true,
      backendKind: "local",
      capabilityContext: {
        backendKind: "local",
        hasLocalBackend: true,
      },
    });

    render(<WorkModeCloudGuard />);
    expect(screen.queryByTestId("work-mode-cloud-guard")).not.toBeInTheDocument();
  });

  it("offers switching to a local backend from cloud", () => {
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

    render(<WorkModeCloudGuard />);

    fireEvent.click(screen.getByTestId("work-mode-switch-local-backend"));

    expect(setActive).toHaveBeenCalledWith("local-1", null);
    expect(useAppModeStore.getState().mode).toBe("work");
    expect(navigate).toHaveBeenCalledWith("/work");
  });
});
