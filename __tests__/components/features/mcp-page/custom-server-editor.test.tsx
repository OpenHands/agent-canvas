import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { CustomServerEditor } from "#/components/features/mcp-page/custom-server-editor";
import { useSettings } from "#/hooks/query/use-settings";

/**
 * Wrapper that only mounts the editor once `useSettings` has resolved.
 * `useAddMcpServer`'s `mutationFn` silently no-ops when settings is
 * undefined (and that no-op resolves, triggering the per-call
 * `onSuccess` → which would close our modal). Waiting for the query
 * makes the test deterministic.
 */
function EditorOnceSettingsLoaded({ onClose }: { onClose: () => void }) {
  const { data } = useSettings();
  if (!data) return null;
  return (
    <CustomServerEditor
      server={{ id: "", type: "sse" }}
      existingServers={[]}
      onClose={onClose}
    />
  );
}

function renderWith(ui: React.ReactNode) {
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    ),
  });
}

describe("CustomServerEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      MOCK_DEFAULT_USER_SETTINGS,
    );
  });

  it("keeps the modal open and does not call onClose when the add mutation fails", async () => {
    // Simulate a backend rejection — the editor should surface the
    // failure as an `onError` toast and leave the modal open so the
    // user can retry. Previously these calls had no `onError` at
    // all, and the modal closed even on a 4xx/5xx because
    // tanstack-query's per-call `onSuccess` doesn't run on
    // rejection but didn't gate the close either way.
    const err = new AxiosError("Boom");
    err.response = {
      status: 400,
      data: { detail: "Server name already in use" },
    } as unknown as AxiosError["response"];
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockRejectedValue(err);

    const onClose = vi.fn();
    renderWith(<EditorOnceSettingsLoaded onClose={onClose} />);

    // Wrapper waits for useSettings before mounting the editor, so
    // by the time we see the editor the mutation hook will fire its
    // mutationFn (rather than silently no-op).
    await screen.findByTestId("mcp-custom-editor");
    fireEvent.change(screen.getByTestId("url-input"), {
      target: { value: "https://example.com/mcp" },
    });
    fireEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));

    // Modal is still mounted — onClose was *not* called on failure.
    await waitFor(() => {
      expect(screen.queryByTestId("mcp-custom-editor")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("calls onClose when the header close button is clicked", async () => {
    const onClose = vi.fn();
    renderWith(<EditorOnceSettingsLoaded onClose={onClose} />);

    fireEvent.click(await screen.findByTestId("close-mcp-custom-editor"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
