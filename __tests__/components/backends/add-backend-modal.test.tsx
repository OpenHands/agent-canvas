import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { AddBackendModal } from "#/components/features/backends/add-backend-modal";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>{ui}</ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("AddBackendModal – two-column layout", () => {
  it("renders a two-column layout with manual and cloud sections", () => {
    renderWithProviders(<AddBackendModal onClose={vi.fn()} />);

    expect(screen.getByTestId("add-backend-name")).toBeInTheDocument();
    expect(screen.getByTestId("add-backend-host")).toBeInTheDocument();
    expect(screen.getByTestId("add-backend-host-helper")).toBeInTheDocument();
    expect(screen.getByTestId("add-backend-api-key")).toBeInTheDocument();
    expect(screen.getByTestId("add-backend-submit")).toBeInTheDocument();

    expect(screen.getByTestId("add-backend-cloud-title")).toBeInTheDocument();
    expect(screen.getByTestId("add-backend-login-button")).toBeInTheDocument();
    expect(
      screen.getByTestId("add-backend-advanced-toggle"),
    ).toBeInTheDocument();
  });

  it("starts with an empty host field (no prefilled value)", () => {
    renderWithProviders(<AddBackendModal onClose={vi.fn()} />);

    expect(screen.getByTestId("add-backend-host")).toHaveValue("");
  });

  it("disables Connect until name and host are filled (local backend)", async () => {
    renderWithProviders(<AddBackendModal onClose={vi.fn()} />);

    const submit = screen.getByTestId(
      "add-backend-submit",
    ) as HTMLButtonElement;
    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByTestId("add-backend-name"), "My Server");
    expect(submit).toBeDisabled();

    // A localhost host infers "local" kind → no API key required
    await user.type(
      screen.getByTestId("add-backend-host"),
      "http://localhost:8000",
    );
    expect(submit).not.toBeDisabled();
  });

  it("allows submitting a local backend with a blank API key", async () => {
    const onClose = vi.fn();
    renderWithProviders(<AddBackendModal onClose={onClose} />);

    const user = userEvent.setup();
    await user.type(screen.getByTestId("add-backend-name"), "Local Extra");
    await user.type(
      screen.getByTestId("add-backend-host"),
      "http://127.0.0.1:18002",
    );

    await user.click(screen.getByTestId("add-backend-submit"));

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    const added = stored.find(
      (b: { name: string }) => b.name === "Local Extra",
    );
    expect(added).toMatchObject({
      name: "Local Extra",
      host: "http://127.0.0.1:18002",
      apiKey: "",
      kind: "local",
    });
  });

  it("requires API key when host infers cloud kind", async () => {
    renderWithProviders(<AddBackendModal onClose={vi.fn()} />);

    const submit = screen.getByTestId(
      "add-backend-submit",
    ) as HTMLButtonElement;
    const user = userEvent.setup();

    await user.type(screen.getByTestId("add-backend-name"), "Cloud");
    await user.type(
      screen.getByTestId("add-backend-host"),
      "https://app.openhands.dev",
    );
    // Cloud host without API key → submit should be disabled
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId("add-backend-api-key"), "token");
    expect(submit).not.toBeDisabled();
  });

  it("saves the backend and closes WITHOUT switching the active selection", async () => {
    const onClose = vi.fn();
    renderWithProviders(<AddBackendModal onClose={onClose} />);

    const user = userEvent.setup();
    await user.type(screen.getByTestId("add-backend-name"), "Local 1");
    await user.type(
      screen.getByTestId("add-backend-host"),
      "http://localhost:9000",
    );
    await user.type(screen.getByTestId("add-backend-api-key"), "k");

    await user.click(screen.getByTestId("add-backend-submit"));

    expect(onClose).toHaveBeenCalled();

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    expect(stored).toHaveLength(2);
    const added = stored.find((b: { name: string }) => b.name === "Local 1");
    expect(added).toMatchObject({
      name: "Local 1",
      host: "http://localhost:9000",
      apiKey: "k",
      kind: "local",
    });

    // Adding a backend must NOT change the active selection.
    expect(window.localStorage.getItem("openhands-active-backend")).toBeNull();
  });

  it("shows the close button", () => {
    const onClose = vi.fn();
    renderWithProviders(<AddBackendModal onClose={onClose} />);

    expect(screen.getByTestId("add-backend-close")).toBeInTheDocument();
  });
});
