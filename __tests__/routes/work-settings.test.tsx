import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkSettingsScreen } from "#/routes/work-settings";

const useWorkModeAvailabilityMock = vi.fn();
const useWorkManifestMock = vi.fn();

vi.mock("#/hooks/use-work-mode-availability", () => ({
  useWorkModeAvailability: () => useWorkModeAvailabilityMock(),
}));

vi.mock("#/hooks/query/use-work-manifest", () => ({
  useWorkManifest: () => useWorkManifestMock(),
}));

vi.mock("#/hooks/query/use-work-runtime-health", () => ({
  useWorkRuntimeHealth: () => ({
    data: { status: "ok" },
    isSuccess: true,
  }),
}));

vi.mock("#/hooks/mutation/use-update-work-manifest", () => ({
  useUpdateWorkManifest: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("#/components/features/work/work-mode-cloud-guard", () => ({
  WorkModeCloudGuard: () => (
    <div data-testid="work-mode-cloud-guard">cloud guard</div>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("WorkSettingsScreen", () => {
  beforeEach(() => {
    useWorkModeAvailabilityMock.mockReturnValue({
      workAllowed: true,
      workExecution: "local",
    });
    useWorkManifestMock.mockReturnValue({
      data: {
        id: "w1",
        name: "Personal",
        grantedFolders: ["/tmp/docs"],
        deliverablesPath: "/tmp/docs/deliverables",
        defaultOptionalTools: [],
      },
      isLoading: false,
    });
  });

  it("renders the work settings form when work mode is available", () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <WorkSettingsScreen />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("work-settings-form")).toBeInTheDocument();
    expect(screen.getByTestId("work-settings-runtime-status")).toBeInTheDocument();
    expect(screen.getByTestId("work-settings-deliverables-path")).toBeInTheDocument();
  });

  it("shows the cloud guard when work mode is unavailable", () => {
    useWorkModeAvailabilityMock.mockReturnValue({
      workAllowed: false,
    });

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <WorkSettingsScreen />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("work-mode-cloud-guard")).toBeInTheDocument();
  });
});
