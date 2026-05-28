import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcpEnvSettings } from "#/components/features/settings/acp-env-settings";
import { AcpEnvService } from "#/api/acp-env-service";

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
    vi.spyOn(AcpEnvService, "list").mockResolvedValue([]);
    vi.spyOn(AcpEnvService, "upsert").mockResolvedValue({ name: "x" });
    vi.spyOn(AcpEnvService, "delete").mockResolvedValue(undefined);
  });

  it("renders only the inline add form when no env vars exist", async () => {
    renderWithClient(<AcpEnvSettings enabled />);
    await screen.findByTestId("acp-env-add-form");
    expect(screen.queryByTestId("acp-env-list")).not.toBeInTheDocument();
    expect(screen.getByTestId("acp-env-empty")).toBeInTheDocument();
  });

  it("renders one row per server-side env var, alphabetised", async () => {
    vi.spyOn(AcpEnvService, "list").mockResolvedValue([
      { name: "OPENAI_API_KEY" },
      { name: "ANTHROPIC_API_KEY" },
    ]);
    renderWithClient(<AcpEnvSettings enabled />);
    await screen.findByTestId("acp-env-row-ANTHROPIC_API_KEY");
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
    renderWithClient(<AcpEnvSettings enabled />);
    await screen.findByTestId("acp-env-add-form");

    const addBtn = screen.getByTestId("acp-env-add-button");
    expect(addBtn).toBeDisabled();

    await user.type(screen.getByTestId("acp-env-name-input"), "FOO");
    expect(addBtn).toBeDisabled();

    await user.type(screen.getByTestId("acp-env-value-input"), "bar");
    expect(addBtn).not.toBeDisabled();
  });

  it("submits Add via the upsert endpoint and clears the form", async () => {
    const user = userEvent.setup();
    const upsert = vi.spyOn(AcpEnvService, "upsert");
    renderWithClient(<AcpEnvSettings enabled />);
    await screen.findByTestId("acp-env-add-form");

    await user.type(screen.getByTestId("acp-env-name-input"), "FOO");
    await user.type(screen.getByTestId("acp-env-value-input"), "bar");
    await user.click(screen.getByTestId("acp-env-add-button"));

    await waitFor(() => {
      expect(upsert).toHaveBeenCalledTimes(1);
    });
    expect(upsert).toHaveBeenCalledWith("FOO", "bar");

    await waitFor(() => {
      expect(screen.getByTestId("acp-env-name-input")).toHaveValue("");
      expect(screen.getByTestId("acp-env-value-input")).toHaveValue("");
    });
  });

  it("rejects an Add whose name duplicates an existing env var", async () => {
    const user = userEvent.setup();
    const upsert = vi.spyOn(AcpEnvService, "upsert");
    vi.spyOn(AcpEnvService, "list").mockResolvedValue([
      { name: "EXISTING_KEY" },
    ]);
    renderWithClient(<AcpEnvSettings enabled />);
    await screen.findByTestId("acp-env-row-EXISTING_KEY");

    await user.type(screen.getByTestId("acp-env-name-input"), "EXISTING_KEY");
    await user.type(screen.getByTestId("acp-env-value-input"), "x");
    await user.click(screen.getByTestId("acp-env-add-button"));

    expect(upsert).not.toHaveBeenCalled();
    expect(screen.getByTestId("acp-env-add-error")).toHaveTextContent(
      "SETTINGS$AGENT_ENV_NAME_DUPLICATE",
    );
  });

  it("rejects invalid env-var names", async () => {
    const user = userEvent.setup();
    const upsert = vi.spyOn(AcpEnvService, "upsert");
    renderWithClient(<AcpEnvSettings enabled />);
    await screen.findByTestId("acp-env-add-form");

    await user.type(screen.getByTestId("acp-env-name-input"), "1BAD");
    await user.type(screen.getByTestId("acp-env-value-input"), "x");
    await user.click(screen.getByTestId("acp-env-add-button"));

    expect(upsert).not.toHaveBeenCalled();
    expect(screen.getByTestId("acp-env-add-error")).toHaveTextContent(
      "SETTINGS$AGENT_ENV_NAME_INVALID",
    );
  });

  it("Delete calls the delete endpoint after confirmation", async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(AcpEnvService, "delete");
    vi.spyOn(AcpEnvService, "list").mockResolvedValue([{ name: "DROP_ME" }]);
    renderWithClient(<AcpEnvSettings enabled />);
    await screen.findByTestId("acp-env-row-DROP_ME");

    await user.click(screen.getByTestId("acp-env-delete-DROP_ME"));
    await user.click(await screen.findByTestId("confirm-button"));

    await waitFor(() => {
      expect(del).toHaveBeenCalledTimes(1);
    });
    expect(del).toHaveBeenCalledWith("DROP_ME");
  });

  it("Cancel on the delete modal aborts the request", async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(AcpEnvService, "delete");
    vi.spyOn(AcpEnvService, "list").mockResolvedValue([{ name: "DROP_ME" }]);
    renderWithClient(<AcpEnvSettings enabled />);
    await screen.findByTestId("acp-env-row-DROP_ME");

    await user.click(screen.getByTestId("acp-env-delete-DROP_ME"));
    await user.click(await screen.findByTestId("cancel-button"));

    expect(del).not.toHaveBeenCalled();
  });

  it("does not fetch when not enabled", async () => {
    const list = vi.spyOn(AcpEnvService, "list");
    renderWithClient(<AcpEnvSettings enabled={false} />);

    // Give react-query a tick. Should not have fired the query.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(list).not.toHaveBeenCalled();
  });
});
