import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillDetailModal } from "#/components/features/skills/skill-detail-modal";
import type { SkillInfo } from "#/types/settings";

function buildSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "deno",
    type: "knowledge",
    source: "/skills/deno/SKILL.md",
    description: "Deno runtime helper",
    triggers: ["deno"],
    version: "1.0.0",
    license: "MIT",
    compatibility: "Requires Deno 1.40+",
    metadata: { author: "OpenHands" },
    allowed_tools: ["bash"],
    is_agentskills_format: true,
    disable_model_invocation: false,
    content: "# Deno\n\nSkill body.",
    ...overrides,
  };
}

describe("SkillDetailModal", () => {
  it("renders metadata fields and closes on request", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onToggle = vi.fn();
    const skill = buildSkill();

    render(
      <SkillDetailModal
        skill={skill}
        enabled
        onToggle={onToggle}
        onClose={onClose}
      />,
    );

    const modal = screen.getByTestId("skill-detail-modal");
    expect(
      within(modal).getByTestId(`skill-modal-name-${skill.name}`),
    ).toHaveTextContent(skill.name);
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-version`),
    ).toBeInTheDocument();
    expect(
      within(modal).getByTestId("skill-type-badge-knowledge"),
    ).toHaveTextContent("SETTINGS$SKILLS_TYPE_KNOWLEDGE");
    expect(
      within(modal).getByTestId(
        `skill-modal-pill-${skill.name}-metadata-author`,
      ),
    ).toHaveTextContent("OpenHands");
    expect(
      within(modal).getByTestId(`skill-modal-field-content-${skill.name}`),
    ).toHaveValue(skill.content);

    await user.click(within(modal).getByTestId("skill-detail-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
