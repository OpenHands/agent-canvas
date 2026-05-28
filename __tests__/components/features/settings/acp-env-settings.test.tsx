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

  it("renders only the inline add form when no env vars exist", () => {
    renderWithClient(<AcpEnvSettings envKeys={[]} />);
    expect(screen.queryByTestId("acp-env-list")).not.toBeInTheDocument();
    expect(screen.getByTestId("acp-env-add-form")).toBeInTheDocument();
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

  it("Add button is disabled until both name and value are filled", async () => {
    const user = userEvent.setup();
    renderWithClient(<AcpEnvSettings envKeys={[]} />);

    const addBtn = screen.getByTestId("acp-env-add-button");
    expect(addBtn).toBeDisabled();

    await user.type(screen.getByTestId("acp-env-name-input"), "FOO");
    expect(addBtn).toBeDisabled();

    await user.type(screen.getByTestId("acp-env-value-input"), "bar");
    expect(addBtn).not.toBeDisabled();
  });

  it("submits Add as a single-key acp_env PATCH and clears the form", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(SettingsService, "saveSettings");
    renderWithClient(<AcpEnvSettings envKeys={[]} />);

    await user.type(screen.getByTestId("acp-env-name-input"), "FOO");
    await user.type(screen.getByTestId("acp-env-value-input"), "bar");
    await user.click(screen.getByTestId("acp-env-add-button"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff).toEqual({ acp_env: { FOO: "bar" } });

    // After success the form clears so the next add is friction-free.
    await waitFor(() => {
      expect(screen.getByTestId("acp-env-name-input")).toHaveValue("");
      expect(screen.getByTestId("acp-env-value-input")).toHaveValue("");
    });
  });

  it("rejects an Add whose name duplicates an existing key", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(SettingsService, "saveSettings");
    renderWithClient(<AcpEnvSettings envKeys={["EXISTING_KEY"]} />);

    await user.type(screen.getByTestId("acp-env-name-input"), "EXISTING_KEY");
    await user.type(screen.getByTestId("acp-env-value-input"), "x");
    await user.click(screen.getByTestId("acp-env-add-button"));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId("acp-env-add-error")).toHaveTextContent(
      "SETTINGS$AGENT_ENV_NAME_DUPLICATE",
    );
  });

  it("rejects invalid env-var names", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(SettingsService, "saveSettings");
    renderWithClient(<AcpEnvSettings envKeys={[]} />);

    await user.type(screen.getByTestId("acp-env-name-input"), "1BAD");
    await user.type(screen.getByTestId("acp-env-value-input"), "x");
    await user.click(screen.getByTestId("acp-env-add-button"));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId("acp-env-add-error")).toHaveTextContent(
      "SETTINGS$AGENT_ENV_NAME_INVALID",
    );
  });

  it("delete sends acp_env: { name: \"\" } (soft-delete) after confirmation", async () => {
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
      acp_env: { DROP_ME: "" },
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
