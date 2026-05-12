import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders } from "test-utils";
import { SkillsModal } from "#/components/features/conversation-panel/skills-modal";
import SkillsService from "#/api/skills-service";
import { AgentState } from "#/types/agent-state";
import { useAgentState } from "#/hooks/use-agent-state";

vi.mock("#/hooks/use-agent-state", () => ({
  useAgentState: vi.fn(),
}));

describe("SkillsModal", () => {
  const mockOnClose = vi.fn();

  const defaultProps = {
    onClose: mockOnClose,
  };

  const mockSkills = [
    {
      name: "Test Skill 1",
      type: "repo" as const,
      source: null,
      triggers: ["test", "example"],
      content: "This is test content for skill 1",
    },
    {
      name: "Test Skill 2",
      type: "knowledge" as const,
      source: null,
      triggers: ["help", "support"],
      content: "This is test content for skill 2",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(SkillsService, "getSkills").mockResolvedValue(mockSkills);

    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.AWAITING_USER_INPUT,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Refresh Button Rendering", () => {
    it("should render the refresh button with correct text and test ID", async () => {
      renderWithProviders(<SkillsModal {...defaultProps} />);

      const refreshButton = await screen.findByTestId("refresh-skills");
      expect(refreshButton).toBeInTheDocument();
      expect(refreshButton).toHaveTextContent("BUTTON$REFRESH");
    });
  });

  describe("Refresh Button Functionality", () => {
    it("should call refetch when refresh button is clicked", async () => {
      const user = userEvent.setup();
      const refreshSpy = vi.spyOn(SkillsService, "getSkills");

      renderWithProviders(<SkillsModal {...defaultProps} />);

      const refreshButton = await screen.findByTestId("refresh-skills");

      refreshSpy.mockClear();

      await user.click(refreshButton);

      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe("Skills Display", () => {
    it("should display skills correctly", async () => {
      vi.spyOn(SkillsService, "getSkills").mockResolvedValue(mockSkills);

      renderWithProviders(<SkillsModal {...defaultProps} />);

      await screen.findByText("Test Skill 1");
      expect(screen.getByText("Test Skill 1")).toBeInTheDocument();
      expect(screen.getByText("Test Skill 2")).toBeInTheDocument();
    });
  });
});
