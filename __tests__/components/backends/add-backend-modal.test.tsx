import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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

describe("AddBackendModal", () => {
  it("places Cancel before Save in the footer so the dominant action is the last focusable button", () => {
    // Arrange: render the modal so both footer buttons are mounted.
    renderWithProviders(<AddBackendModal onClose={vi.fn()} />);

    // Act: locate the two footer buttons.
    const cancel = screen.getByTestId("add-backend-cancel");
    const submit = screen.getByTestId("add-backend-submit");

    // Assert: Cancel precedes Save in DOM order — this is what governs
    // tab order and screen-reader reading order, so the dominant Save
    // action is the rightmost / last-reached button.
    // eslint-disable-next-line no-bitwise
    expect(
      cancel.compareDocumentPosition(submit) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("disables submit until all fields are filled", async () => {
    const onClose = vi.fn();
    renderWithProviders(<AddBackendModal onClose={onClose} />);

    const submit = screen.getByTestId(
      "add-backend-submit",
    ) as HTMLButtonElement;
    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByTestId("add-backend-name"), "Production");
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByTestId("add-backend-host"),
      "https://app.all-hands.dev",
    );
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId("add-backend-api-key"), "secret-key");
    expect(submit).not.toBeDisabled();
  });

  it("infers cloud kind from an all-hands.dev host", async () => {
    renderWithProviders(<AddBackendModal onClose={vi.fn()} />);

    const cloudRadio = screen.getByTestId(
      "add-backend-kind-cloud",
    ) as HTMLInputElement;
    const localRadio = screen.getByTestId(
      "add-backend-kind-local",
    ) as HTMLInputElement;

    fireEvent.change(screen.getByTestId("add-backend-host"), {
      target: { value: "https://app.all-hands.dev" },
    });

    expect(cloudRadio.checked).toBe(true);
    expect(localRadio.checked).toBe(false);
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
    // No API key entered; kind auto-infers to "local" from the host.

    await user.click(screen.getByTestId("add-backend-submit"));

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    // The seeded default ("Local") is in the list alongside the new
    // entry. Find the user-added one to assert its shape.
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

  it("keeps submit disabled for cloud backends until an API key is entered", async () => {
    renderWithProviders(<AddBackendModal onClose={vi.fn()} />);

    const submit = screen.getByTestId(
      "add-backend-submit",
    ) as HTMLButtonElement;
    const user = userEvent.setup();

    await user.type(screen.getByTestId("add-backend-name"), "Cloud");
    await user.type(
      screen.getByTestId("add-backend-host"),
      "https://app.all-hands.dev",
    );
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
    await user.click(screen.getByTestId("add-backend-kind-local"));

    await user.click(screen.getByTestId("add-backend-submit"));

    expect(onClose).toHaveBeenCalled();

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    // The seeded default ("Local") is in the list alongside the new
    // entry. Find the user-added one to assert its shape.
    expect(stored).toHaveLength(2);
    const added = stored.find((b: { name: string }) => b.name === "Local 1");
    expect(added).toMatchObject({
      name: "Local 1",
      host: "http://localhost:9000",
      apiKey: "k",
      kind: "local",
    });

    // Adding a backend must NOT change the active selection. Auto-switch
    // would write `(backendId, null)` for a cloud backend, which the
    // dropdown can't render once orgs load — UI/API would drift.
    expect(window.localStorage.getItem("openhands-active-backend")).toBeNull();
  });
});
