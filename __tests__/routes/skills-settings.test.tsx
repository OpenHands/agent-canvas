import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsSettingsScreen from "#/routes/skills-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import SkillsService from "#/api/skills-service";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings } from "#/types/settings";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
      ...overrides.agent_settings,
    },
  };
}

function renderSkillsSettingsScreen() {
  return render(<SkillsSettingsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    ),
  });
}

describe("SkillsSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the description text inside the description badge", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    const badge = await screen.findByTestId(
      "skills-settings-description-badge",
    );
    expect(badge).toHaveTextContent("SETTINGS$SKILLS_DESCRIPTION");
  });
});
