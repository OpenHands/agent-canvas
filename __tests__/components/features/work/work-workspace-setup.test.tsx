import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkWorkspaceSetup } from "#/components/features/work/work-workspace-setup";

const updateManifest = vi.fn();

vi.mock("#/hooks/mutation/use-update-work-manifest", () => ({
  useUpdateWorkManifest: () => ({
    mutate: updateManifest,
    isPending: false,
  }),
}));

vi.mock("#/components/features/home/workspace-dropdown/folder-browser-modal", () => ({
  FolderBrowserModal: ({
    isOpen,
    onAdd,
  }: {
    isOpen: boolean;
    onAdd: (items: Array<{ path: string }>) => void;
  }) =>
    isOpen ? (
      <button
        type="button"
        data-testid="mock-folder-picker"
        onClick={() => onAdd([{ path: "/tmp/work" }])}
      >
        pick
      </button>
    ) : null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("WorkWorkspaceSetup", () => {
  beforeEach(() => {
    updateManifest.mockClear();
  });

  it("saves selected folders to the manifest", () => {
    render(
      <WorkWorkspaceSetup
        manifest={{
          id: "w1",
          name: "Default",
          grantedFolders: [],
          deliverablesPath: "",
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("work-setup-add-folders"));
    fireEvent.click(screen.getByTestId("mock-folder-picker"));
    fireEvent.click(screen.getByTestId("work-setup-save"));

    expect(updateManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        grantedFolders: ["/tmp/work"],
        deliverablesPath: "/tmp/work/Work Deliverables",
      }),
    );
  });
});
