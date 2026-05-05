import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import SettingsService from "#/api/settings-service/settings-service.api";
import { SettingsForm } from "#/components/shared/modals/settings/settings-form";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { getAgentSettingValue } from "#/utils/sdk-settings-schema";

describe("SettingsForm", () => {
  const onCloseMock = vi.fn();
  const saveSettingsSpy = vi.spyOn(SettingsService, "saveSettings");

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock saveSettings to resolve immediately
    saveSettingsSpy.mockResolvedValue(true);
  });

  it("should save the user settings and close the modal when submitted outside a conversation route", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingsForm settings={DEFAULT_SETTINGS} onClose={onCloseMock} />,
      {
        navigation: { currentPath: "/settings" },
      },
    );

    await user.click(screen.getByTestId("save-settings-button"));

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_settings_diff: expect.objectContaining({
            llm: expect.objectContaining({
              model: getAgentSettingValue(DEFAULT_SETTINGS, "llm.model"),
            }),
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it("should confirm before saving when submitted from a conversation route", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettingsForm settings={DEFAULT_SETTINGS} onClose={onCloseMock} />,
      {
        navigation: {
          currentPath: "/conversations/test-conversation-id",
          conversationId: "test-conversation-id",
        },
      },
    );

    await user.click(screen.getByTestId("save-settings-button"));

    expect(saveSettingsSpy).not.toHaveBeenCalled();
    const confirmButton = screen.getByRole("button", {
      name: /BUTTON\$END_SESSION|end session/i,
    });
    expect(confirmButton).toBeInTheDocument();

    await user.click(confirmButton);

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_settings_diff: expect.objectContaining({
            llm: expect.objectContaining({
              model: getAgentSettingValue(DEFAULT_SETTINGS, "llm.model"),
            }),
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(onCloseMock).toHaveBeenCalled();
    });
  });
});
