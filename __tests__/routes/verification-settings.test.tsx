import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import VerificationSettingsScreen from "#/routes/verification-settings";
import { Settings } from "#/types/settings";

const VERIFICATION_SCHEMA: NonNullable<Settings["conversation_settings_schema"]> =
  {
    model_name: "ConversationSettings",
    sections: [
      {
        key: "verification",
        label: "Verification",
        fields: [
          {
            key: "confirmation_mode",
            label: "Confirmation mode",
            description:
              "Pause for confirmation before the agent performs high-risk actions.",
            section: "verification",
            section_label: "Verification",
            value_type: "boolean",
            default: false,
            choices: [],
            depends_on: [],
            prominence: "major",
            secret: false,
            required: true,
          },
          {
            key: "security_analyzer",
            label: "Security analyzer",
            description:
              "Choose how OpenHands should analyze actions before asking for confirmation.",
            section: "verification",
            section_label: "Verification",
            value_type: "string",
            default: "llm",
            choices: [
              { label: "llm", value: "llm" },
              { label: "none", value: "none" },
            ],
            depends_on: ["confirmation_mode"],
            prominence: "major",
            secret: false,
            required: false,
          },
        ],
      },
    ],
  };

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    conversation_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.conversation_settings,
      ...overrides.conversation_settings,
    },
    conversation_settings_schema: "conversation_settings_schema" in overrides
      ? overrides.conversation_settings_schema
      : VERIFICATION_SCHEMA,
  };
}

function renderVerificationSettingsScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<VerificationSettingsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("VerificationSettingsScreen", () => {
  it("renders schema fields and saves conversation settings", async () => {
    let settings = buildSettings({
      conversation_settings: {
        confirmation_mode: true,
        security_analyzer: "llm",
      },
    });
    vi.spyOn(SettingsService, "getSettings").mockImplementation(
      async () => settings,
    );
    const saveSettingsSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockImplementation(async (payload) => {
        settings = buildSettings({
          ...settings,
          conversation_settings: {
            ...settings.conversation_settings,
            ...(payload.conversation_settings_diff as NonNullable<
              Settings["conversation_settings"]
            >),
          },
        });
        return true;
      });

    renderVerificationSettingsScreen();

    await screen.findByTestId("verification-settings-screen");

    const confirmationToggle = screen.getByTestId(
      "sdk-settings-confirmation_mode",
    );
    expect(confirmationToggle).toBeChecked();
    expect(
      screen.getByRole("combobox", { name: /security analyzer/i }),
    ).toBeInTheDocument();

    await userEvent.click(confirmationToggle.closest("label")!);
    await userEvent.click(screen.getByTestId("save-button"));

    await waitFor(() => {
      expect(saveSettingsSpy).toHaveBeenCalledWith({
        conversation_settings_diff: {
          confirmation_mode: false,
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("sdk-settings-confirmation_mode"),
      ).not.toBeChecked();
    });
    expect(
      screen.queryByRole("combobox", { name: /security analyzer/i }),
    ).not.toBeInTheDocument();
  });

  it("skips verification fields that are absent from the schema", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({
        conversation_settings_schema: {
          ...VERIFICATION_SCHEMA,
          sections: [
            {
              ...VERIFICATION_SCHEMA.sections[0],
              fields: VERIFICATION_SCHEMA.sections[0].fields.filter(
                (field) => field.key !== "security_analyzer",
              ),
            },
          ],
        },
        conversation_settings: {
          confirmation_mode: true,
          security_analyzer: "llm",
        },
      }),
    );

    renderVerificationSettingsScreen();

    await screen.findByTestId("verification-settings-screen");

    expect(
      screen.getByTestId("sdk-settings-confirmation_mode"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /security analyzer/i }),
    ).not.toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("shows the shared schema-unavailable state when the schema request fails", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ conversation_settings_schema: null }),
    );
    vi.spyOn(SettingsService, "getConversationSettingsSchema").mockRejectedValue(
      new Error("schema unavailable"),
    );

    renderVerificationSettingsScreen();

    expect(
      await screen.findByText("SETTINGS$SDK_SCHEMA_UNAVAILABLE"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("verification-settings-screen"),
    ).not.toBeInTheDocument();
  });
});
