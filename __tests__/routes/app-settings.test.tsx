import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppSettingsScreen from "#/routes/app-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings } from "#/types/settings";

class MockNotification {
  static permission: NotificationPermission = "default";

  static requestPermission = vi.fn<() => Promise<NotificationPermission>>();
}

vi.stubGlobal("Notification", MockNotification);

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
      ...overrides.agent_settings,
    },
    conversation_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.conversation_settings,
      ...overrides.conversation_settings,
    },
  };
}

function renderAppSettingsScreen() {
  return render(<AppSettingsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("AppSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    MockNotification.permission = "default";
    MockNotification.requestPermission.mockReset();
  });

  it("renders the OSS application settings form", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        git_user_name: "octocat",
        git_user_email: "octocat@example.com",
      }),
    );

    renderAppSettingsScreen();

    const analyticsSwitch = await screen.findByTestId(
      "enable-analytics-switch",
    );

    expect(analyticsSwitch).toBeInTheDocument();
    expect(
      screen.getByTestId("enable-desktop-notifications-switch"),
    ).not.toBeChecked();
    expect(
      screen.getByText("SETTINGS$DESKTOP_NOTIFICATIONS_DESCRIPTION"),
    ).toBeInTheDocument();
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();
    expect(screen.getByTestId("git-user-name-input")).toHaveValue("octocat");
    expect(screen.getByTestId("git-user-email-input")).toHaveValue(
      "octocat@example.com",
    );
  });

  it("saves updated git author details in OSS mode", async () => {
    const saveSettingsSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        git_user_name: "octocat",
        git_user_email: "octocat@example.com",
      }),
    );

    renderAppSettingsScreen();

    const user = userEvent.setup();
    const nameInput = await screen.findByTestId("git-user-name-input");

    await user.clear(nameInput);
    await user.type(nameInput, "monalisa");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          git_user_name: "monalisa",
          git_user_email: "octocat@example.com",
        }),
      );
    });
  });

  it("requests permission only when desktop notifications are enabled", async () => {
    const saveSettingsSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ enable_desktop_notifications: false }),
    );
    MockNotification.requestPermission.mockImplementation(async () => {
      MockNotification.permission = "granted";
      return "granted";
    });

    renderAppSettingsScreen();

    const user = userEvent.setup();
    const desktopNotificationsSwitch = await screen.findByTestId(
      "enable-desktop-notifications-switch",
    );
    expect(MockNotification.requestPermission).not.toHaveBeenCalled();

    await user.click(desktopNotificationsSwitch);

    await waitFor(() => {
      expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
      expect(desktopNotificationsSwitch).toBeChecked();
    });

    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ enable_desktop_notifications: true }),
      );
    });
  });

  it("leaves the toggle off and disabled when notification permission is denied", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ enable_desktop_notifications: false }),
    );
    MockNotification.requestPermission.mockImplementation(async () => {
      MockNotification.permission = "denied";
      return "denied";
    });

    renderAppSettingsScreen();

    const user = userEvent.setup();
    const desktopNotificationsSwitch = await screen.findByTestId(
      "enable-desktop-notifications-switch",
    );
    await user.click(desktopNotificationsSwitch);

    await waitFor(() => {
      expect(desktopNotificationsSwitch).not.toBeChecked();
      expect(desktopNotificationsSwitch).toBeDisabled();
    });
    expect(
      screen.getByText("SETTINGS$DESKTOP_NOTIFICATIONS_UNAVAILABLE"),
    ).toBeInTheDocument();
  });
});
