import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcpEnvSettings } from "#/components/features/settings/acp-env-settings";
import SettingsService from "#/api/settings-service/settings-service.api";

function renderWithClient(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("AcpEnvSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
  });

  it("renders the empty state when no env vars are configured", () => {
    renderWithClient(<AcpEnvSettings envKeys={[]} />);
    expect(screen.getByTestId("acp-env-empty")).toBeInTheDocument();
  });

  it("renders one row per env var name, alphabetised", () => {
    renderWithClient(
      <AcpEnvSettings envKeys={["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]} />,
    );
    const rows = screen.getAllByTestId(/^acp-env-row-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute(
      "data-testid",
      "acp-env-row-ANTHROPIC_API_KEY",
    );
    expect(rows[1]).toHaveAttribute(
      "data-testid",
      "acp-env-row-OPENAI_API_KEY",
    );
  });

  it("opens the add form when the Add button is clicked", async () => {
    const user = userEvent.setup();
    renderWithClient(<AcpEnvSettings envKeys={[]} />);

    expect(screen.queryByTestId("acp-env-form")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("acp-env-add-button"));
    expect(screen.getByTestId("acp-env-form")).toBeInTheDocument();
  });

  it("submits the add form as a single-key acp_env PATCH", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(SettingsService, "saveSettings");
    renderWithClient(<AcpEnvSettings envKeys={[]} />);

    await user.click(screen.getByTestId("acp-env-add-button"));
    await user.type(screen.getByTestId("acp-env-name-input"), "FOO");
    await user.type(screen.getByTestId("acp-env-value-input"), "bar");
    await user.click(screen.getByTestId("acp-env-submit-button"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff).toEqual({ acp_env: { FOO: "bar" } });
  });

  it("rejects duplicates against an existing key", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(SettingsService, "saveSettings");
    renderWithClient(<AcpEnvSettings envKeys={["EXISTING_KEY"]} />);

    await user.click(screen.getByTestId("acp-env-add-button"));
    await user.type(screen.getByTestId("acp-env-name-input"), "EXISTING_KEY");
    await user.type(screen.getByTestId("acp-env-value-input"), "x");
    await user.click(screen.getByTestId("acp-env-submit-button"));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId("acp-env-form-error")).toHaveTextContent(
      "SETTINGS$AGENT_ENV_NAME_DUPLICATE",
    );
  });

  it("delete sends acp_env: { name: null } after confirmation", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(SettingsService, "saveSettings");
    renderWithClient(<AcpEnvSettings envKeys={["DROP_ME"]} />);

    await user.click(screen.getByTestId("acp-env-delete-DROP_ME"));
    await user.click(await screen.findByTestId("confirm-button"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff).toEqual({
      acp_env: { DROP_ME: null },
    });
  });

  it("cancel on the delete modal aborts the PATCH", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(SettingsService, "saveSettings");
    renderWithClient(<AcpEnvSettings envKeys={["DROP_ME"]} />);

    await user.click(screen.getByTestId("acp-env-delete-DROP_ME"));
    await user.click(await screen.findByTestId("cancel-button"));

    expect(save).not.toHaveBeenCalled();
  });
});
