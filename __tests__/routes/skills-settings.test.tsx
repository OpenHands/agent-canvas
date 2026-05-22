import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsSettingsScreen from "#/routes/skills-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import SkillsService from "#/api/skills-service";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings, SkillInfo } from "#/types/settings";
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

function buildSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "deno",
    type: "knowledge",
    source: "/Users/test/.openhands/cache/skills/public-skills/skills/deno/SKILL.md",
    description:
      "If the project uses deno, use this skill to initialize Deno projects.",
    triggers: ["deno", "deno.json", "deno.lock"],
    version: "1.0.0",
    license: "Apache-2.0",
    compatibility: "Requires Deno 1.40+",
    metadata: null,
    allowed_tools: ["bash"],
    is_agentskills_format: true,
    disable_model_invocation: false,
    ...overrides,
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
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());
  });

  it("renders the description text inside the description badge", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    const description = await screen.findByTestId(
      "skills-settings-description",
    );
    expect(description).toHaveTextContent("SETTINGS$SKILLS_PAGE_DESCRIPTION");
    expect(screen.getByText("NAV$EXTENSIONS")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-extensions-/skills")).toHaveTextContent(
      "Skills",
    );
    expect(screen.getByTestId("sidebar-extensions-/plugins")).toHaveTextContent(
      "Plugins",
    );
    expect(screen.getByTestId("sidebar-extensions-/mcp")).toHaveTextContent(
      "MCP Servers",
    );
  });

  it("shows card subtitle text from skill content when description is omitted", async () => {
    const skill = buildSkill({
      name: "SSH Microagent",
      description: null,
      content: `---
description: Connect and run commands on remote machines over SSH.
---
# SSH Microagent

Full skill body.`,
      triggers: ["ssh"],
    });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    expect(
      within(card).getByTestId(`skill-description-${skill.name}`),
    ).toHaveTextContent("Connect and run commands on remote machines over SSH.");
  });

  it("surfaces the YAML description under the card title with the source path beneath it", async () => {
    const skill = buildSkill();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    expect(
      within(card).getByTestId(`skill-description-${skill.name}`),
    ).toHaveTextContent(skill.description!);
    expect(
      within(card).getByTestId(`skill-source-${skill.name}`),
    ).toHaveTextContent(skill.source!);
    expect(
      within(card).getByTestId(`skill-icon-${skill.name}`),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("skill-type-badge-knowledge"),
    ).toHaveTextContent("SETTINGS$SKILLS_TYPE_KNOWLEDGE");
  });

  it("copies the source path when the copy button is clicked", async () => {
    const user = userEvent.setup();
    const skill = buildSkill();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(
      within(card).getByTestId(`skill-copy-source-${skill.name}`),
    );

    expect(writeText).toHaveBeenCalledWith(skill.source);
  });

  it("filters skills by name, description, or trigger via the search input", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", description: "Deno runtime helper" }),
      buildSkill({
        name: "vercel",
        description: "Preview deployment helper",
        triggers: ["vercel", "preview deployment"],
        source: "/skills/vercel/SKILL.md",
      }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    fireEvent.change(screen.getByTestId("skills-search-input"), {
      target: { value: "preview" },
    });

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-vercel")).toBeInTheDocument();
  });

  it("narrows the visible skills when a type filter chip is selected", async () => {
    const user = userEvent.setup();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", type: "knowledge" }),
      buildSkill({
        name: "global-rules",
        type: "repo",
        triggers: [],
        source: "/skills/global-rules.md",
      }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    const filter = screen.getByTestId("skills-type-filter");
    await user.click(within(filter).getByTestId("dropdown-trigger"));
    await user.click(
      screen.getByRole("option", { name: "SETTINGS$SKILLS_TYPE_REPO" }),
    );

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-global-rules")).toBeInTheDocument();
  });

  it("opens a detail modal with full metadata when a skill card is clicked", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({
      name: "rich",
      license: "MIT",
      compatibility: "Requires Python 3.11+",
      allowed_tools: ["bash", "execute_bash"],
      source: "/skills/rich/SKILL.md",
    });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(card);

    const modal = await screen.findByTestId("skill-detail-modal");
    expect(modal).toHaveAttribute("data-skill-name", skill.name);
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-license`),
    ).toHaveTextContent("MIT");
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-compatibility`),
    ).toHaveTextContent("Requires Python 3.11+");
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-tool-bash`),
    ).toHaveTextContent("bash");
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-tool-execute_bash`),
    ).toHaveTextContent("execute_bash");
    expect(
      within(modal).getByTestId(`skill-modal-toggle-${skill.name}`),
    ).toBeInTheDocument();
  });

  it("toggles a skill from the detail modal", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({ name: "toggle-me" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);
    await user.click(card);

    const modal = await screen.findByTestId("skill-detail-modal");
    expect(within(modal).getByText("SETTINGS$SKILLS_ENABLED")).toBeInTheDocument();

    await user.click(
      within(modal).getByTestId(`skill-modal-toggle-${skill.name}`),
    );

    expect(card).toHaveClass("opacity-70");
    expect(within(modal).getByText("SETTINGS$SKILLS_DISABLED")).toBeInTheDocument();
  });

  it("toggles a skill from the card without opening the modal", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({ name: "card-toggle" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(within(card).getByTestId(`skill-toggle-${skill.name}`));

    expect(card).toHaveClass("opacity-70");
    expect(screen.queryByTestId("skill-detail-modal")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when no skills match the current filters", async () => {
    const skill = buildSkill();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${skill.name}`);

    fireEvent.change(screen.getByTestId("skills-search-input"), {
      target: { value: "no-such-skill-xyz" },
    });

    expect(screen.getByTestId("skills-no-match")).toBeInTheDocument();
  });
});
