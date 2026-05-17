// @vitest-environment jsdom

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { BACKENDS_STORAGE_KEY } from "#/api/backend-registry/storage";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { ChooseBackendStep } from "#/components/features/onboarding/steps/choose-backend-step";
import { I18nKey } from "#/i18n/declaration";
import {
  getSetupStatus,
  startDockerBackend,
  stopDockerBackend,
} from "#/api/setup-service";

vi.mock("#/api/setup-service", () => ({
  getSetupStatus: vi.fn(),
  startDockerBackend: vi.fn(),
  stopDockerBackend: vi.fn(),
}));

const mockGetSetupStatus = vi.mocked(getSetupStatus);
const mockStartDockerBackend = vi.mocked(startDockerBackend);
const mockStopDockerBackend = vi.mocked(stopDockerBackend);

function renderStep() {
  return render(
    <ActiveBackendProvider>
      <ChooseBackendStep onBack={vi.fn()} onNext={vi.fn()} />
    </ActiveBackendProvider>,
  );
}

function storedBackends() {
  return JSON.parse(window.localStorage.getItem(BACKENDS_STORAGE_KEY) ?? "[]");
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  __resetActiveStoreForTests();
  mockGetSetupStatus.mockResolvedValue({
    dockerInstalled: true,
    dockerRunning: true,
    dockerBackendRunning: false,
    dockerBackendPort: 18002,
    dockerBackendUrl: "http://127.0.0.1:18002",
    projectPath: null,
  });
  mockStartDockerBackend.mockResolvedValue({
    status: "starting",
    host: "http://127.0.0.1",
    port: 18002,
    url: "http://127.0.0.1:18002",
  });
  mockStopDockerBackend.mockResolvedValue(undefined);
});

describe("ChooseBackendStep", () => {
  it("keeps the local backend selected by default", async () => {
    renderStep();

    await waitFor(() => expect(mockGetSetupStatus).toHaveBeenCalled());

    expect(screen.getByTestId("choose-backend-local")).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByTestId("onboarding-backend-next")).not.toBeDisabled();
  });

  it("requires selected Docker backend to start before continuing and registers it", async () => {
    renderStep();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("choose-backend-docker-toggle"));
    expect(screen.getByTestId("onboarding-backend-next")).toBeDisabled();

    await user.type(
      screen.getByTestId("choose-backend-docker-path"),
      "/Users/test/project",
    );
    await user.click(screen.getByTestId("choose-backend-docker-start"));

    await screen.findByTestId("choose-backend-docker-status-running");

    expect(mockStartDockerBackend).toHaveBeenCalledWith("/Users/test/project");
    expect(screen.getByTestId("onboarding-backend-next")).not.toBeDisabled();
    expect(storedBackends()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_TITLE,
          host: "http://127.0.0.1:18002",
          kind: "local",
          workingDir: "/projects",
        }),
      ]),
    );
  });

  it("reuses a running Docker backend from setup status", async () => {
    mockGetSetupStatus.mockResolvedValue({
      dockerInstalled: true,
      dockerRunning: true,
      dockerBackendRunning: true,
      dockerBackendPort: 18002,
      dockerBackendUrl: "http://127.0.0.1:18002",
      projectPath: "/Users/test/project",
    });
    renderStep();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("choose-backend-docker-toggle"));
    await user.type(
      screen.getByTestId("choose-backend-docker-path"),
      "/Users/test/project",
    );
    await user.click(screen.getByTestId("choose-backend-docker-start"));

    await screen.findByTestId("choose-backend-docker-status-running");

    expect(mockStartDockerBackend).not.toHaveBeenCalled();
    expect(storedBackends()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          host: "http://127.0.0.1:18002",
          kind: "local",
          workingDir: "/projects",
        }),
      ]),
    );
  });

  it("stops and removes Docker backend when the running option is deselected", async () => {
    renderStep();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("choose-backend-docker-toggle"));
    await user.type(
      screen.getByTestId("choose-backend-docker-path"),
      "/Users/test/project",
    );
    await user.click(screen.getByTestId("choose-backend-docker-start"));
    await screen.findByTestId("choose-backend-docker-status-running");

    await user.click(screen.getByTestId("choose-backend-docker-toggle"));

    expect(mockStopDockerBackend).toHaveBeenCalledTimes(1);
    expect(storedBackends()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          host: "http://127.0.0.1:18002",
        }),
      ]),
    );
  });
});
