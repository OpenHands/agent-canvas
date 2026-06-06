/**
 * Mock-LLM E2E tests: skill loading from project and user directories.
 *
 * These tests verify that the SDK's skill loading machinery works
 * end-to-end with the real agent-server stack:
 *
 * 1. **Project skills** from `{workspace}/.agents/skills/` are loaded
 *    alongside bundled public skills and trigger on matching keywords.
 *
 * 2. **User skills** from `~/.openhands/skills/` are loaded and trigger
 *    on matching keywords.
 *
 * 3. **Skill deletion**: removing a skill file means it is NOT loaded
 *    in subsequent conversations.
 *
 * All tests create ephemeral SKILL.md files with unique trigger keywords,
 * send a message containing those keywords, and verify `activated_skills`
 * appears in the conversation events API.
 */

import { test, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForPath,
  waitForNonUserMessageText,
  getConversationIdFromURL,
  deleteConversation,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
  ensureMockLLMProfile,
  setChatInput,
} from "./utils/mock-llm-helpers";

// ── Paths ────────────────────────────────────────────────────────────

/** STATE_DIR matches playwright.mock-llm.config.ts */
const STATE_DIR = resolve(".tmp/mock-llm-state");

/**
 * Default workspace path. The frontend sends `working_dir: "workspace/project"`
 * and the agent-server resolves it relative to its CWD (`${STATE_DIR}/workspaces`).
 */
const WORKSPACE_DIR = join(STATE_DIR, "workspaces", "workspace", "project");

/** User-level skills directory (SDK searches `~/.openhands/skills/`). */
const USER_SKILLS_DIR = join(homedir(), ".openhands", "skills");

// ── Skill content builders ───────────────────────────────────────────

function makeSkillMd(
  name: string,
  trigger: string,
  description: string,
): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "triggers:",
    `- ${trigger}`,
    "---",
    "",
    `This is the ${name} skill content for E2E testing.`,
    `It should activate when the keyword "${trigger}" appears.`,
  ].join("\n");
}

function writeSkill(
  baseDir: string,
  name: string,
  trigger: string,
  description = "E2E test skill",
): void {
  const dir = join(baseDir, ".agents", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), makeSkillMd(name, trigger, description));
}

function writeUserSkill(
  name: string,
  trigger: string,
  description = "E2E test user skill",
): void {
  const dir = join(USER_SKILLS_DIR, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), makeSkillMd(name, trigger, description));
}

function removeSkill(baseDir: string, name: string): void {
  const dir = join(baseDir, ".agents", "skills", name);
  rmSync(dir, { recursive: true, force: true });
}

function removeUserSkill(name: string): void {
  const dir = join(USER_SKILLS_DIR, name);
  rmSync(dir, { recursive: true, force: true });
}

// ── Shared assertion helper ──────────────────────────────────────────

/**
 * Poll the events API until we find an event with `activated_skills`
 * containing the expected skill name. Returns the list of activated skills.
 */
async function assertSkillActivated(
  request: import("@playwright/test").APIRequestContext,
  conversationId: string,
  expectedSkillName: string,
): Promise<string[]> {
  let foundSkills: string[] = [];

  await expect
    .poll(
      async () => {
        const resp = await request.get(
          `${BACKEND_URL}/api/conversations/${encodeURIComponent(conversationId)}/events/search`,
          {
            headers: { "X-Session-API-Key": SESSION_API_KEY },
            params: { limit: "50" },
          },
        );
        if (!resp.ok()) return `events API: HTTP ${resp.status()}`;

        const body = (await resp.json()) as { items?: unknown[] };
        const items = body.items ?? [];

        for (const item of items) {
          const e = item as Record<string, unknown>;
          const skills =
            (e.activated_skills as string[] | undefined) ??
            (e.activated_microagents as string[] | undefined);
          if (Array.isArray(skills) && skills.length > 0) {
            foundSkills = skills;
            if (skills.includes(expectedSkillName)) {
              return "FOUND";
            }
          }
        }

        return `skill "${expectedSkillName}" not in activated_skills (${items.length} events checked)`;
      },
      {
        message: `expected "${expectedSkillName}" in activated_skills`,
        intervals: [1_000, 2_000, 3_000, 5_000],
        timeout: 25_000,
      },
    )
    .toBe("FOUND");

  return foundSkills;
}

/**
 * Poll the events API and verify NO event has `activated_skills` containing
 * the given skill name. Waits for at least one agent reply event before
 * deciding (so we don't just race the empty state).
 */
async function assertSkillNotActivated(
  request: import("@playwright/test").APIRequestContext,
  conversationId: string,
  unexpectedSkillName: string,
): Promise<void> {
  // Wait for the conversation to have at least one agent reply
  await expect
    .poll(
      async () => {
        const resp = await request.get(
          `${BACKEND_URL}/api/conversations/${encodeURIComponent(conversationId)}/events/search`,
          {
            headers: { "X-Session-API-Key": SESSION_API_KEY },
            params: { limit: "50" },
          },
        );
        if (!resp.ok()) return false;
        const body = (await resp.json()) as { items?: unknown[] };
        const items = body.items ?? [];
        // Wait until we see a message_event from the agent (not the user)
        return items.some((item) => {
          const e = item as Record<string, unknown>;
          return e.source === "agent" && e.event_type === "message";
        });
      },
      {
        message: "waiting for agent reply event",
        intervals: [1_000, 2_000, 3_000],
        timeout: 30_000,
      },
    )
    .toBe(true);

  // Now check that the skill was NOT activated
  const resp = await request.get(
    `${BACKEND_URL}/api/conversations/${encodeURIComponent(conversationId)}/events/search`,
    {
      headers: { "X-Session-API-Key": SESSION_API_KEY },
      params: { limit: "100" },
    },
  );
  expect(resp.ok()).toBe(true);
  const body = (await resp.json()) as { items?: unknown[] };
  const items = body.items ?? [];

  for (const item of items) {
    const e = item as Record<string, unknown>;
    const skills =
      (e.activated_skills as string[] | undefined) ??
      (e.activated_microagents as string[] | undefined);
    if (Array.isArray(skills) && skills.includes(unexpectedSkillName)) {
      throw new Error(
        `Expected "${unexpectedSkillName}" NOT to be in activated_skills, but found it`,
      );
    }
  }
}

// ── Trajectory setup ─────────────────────────────────────────────────

const REPLY_TOKEN = "SKILLS_E2E_REPLY_OK";

/**
 * Register a trajectory that handles:
 * - Response 0: padding for internal skill-analysis call
 * - Response 1: the actual agent reply
 */
async function setupSkillTrajectory(
  request: import("@playwright/test").APIRequestContext,
  name: string,
) {
  await registerTrajectory(request, name, [
    { text: "" },
    { text: `Skill test complete. ${REPLY_TOKEN}` },
  ]);
  await activateTrajectory(request, name);
}

/**
 * Register a trajectory for conversations where NO skill triggers
 * (no padding response needed).
 */
async function setupNoSkillTrajectory(
  request: import("@playwright/test").APIRequestContext,
  name: string,
) {
  await registerTrajectory(request, name, [
    { text: `No skill triggered. ${REPLY_TOKEN}` },
  ]);
  await activateTrajectory(request, name);
}

// ── Tests ─────────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

test.describe("skill loading: project, user, and deletion", () => {
  const conversationIds = new Set<string>();

  // Unique skill names to avoid collisions with real skills
  const PROJECT_SKILL_NAME = "e2e-test-project-skill";
  const PROJECT_SKILL_TRIGGER = "xyzzy-project-e2e-test";

  const USER_SKILL_NAME = "e2e-test-user-skill";
  const USER_SKILL_TRIGGER = "xyzzy-user-e2e-test";

  test.beforeEach(async ({ page }) => {
    await seedLocalStorage(page);
  });

  test.afterEach(async ({ request }) => {
    for (const id of Array.from(conversationIds)) {
      try {
        await deleteConversation(request, id);
        conversationIds.delete(id);
      } catch {
        // best-effort cleanup
      }
    }
    await resetMockLLM(request).catch(() => {});
  });

  test.afterAll(() => {
    // Clean up any skill files left behind
    removeSkill(WORKSPACE_DIR, PROJECT_SKILL_NAME);
    removeUserSkill(USER_SKILL_NAME);
  });

  // ── Test 1: Project skill loaded from workspace ──────────────────

  test("project skill in workspace/.agents/skills/ triggers on matching keyword", async ({
    page,
    request,
  }) => {
    await ensureMockLLMProfile(request);

    // Create the project skill file BEFORE starting the conversation
    await test.step("create project skill file", () => {
      writeSkill(WORKSPACE_DIR, PROJECT_SKILL_NAME, PROJECT_SKILL_TRIGGER);
      expect(
        existsSync(
          join(
            WORKSPACE_DIR,
            ".agents",
            "skills",
            PROJECT_SKILL_NAME,
            "SKILL.md",
          ),
        ),
      ).toBe(true);
    });

    await setupSkillTrajectory(request, "project-skill");

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    // Send a message containing the project skill's trigger keyword
    await test.step("send message with project skill trigger", async () => {
      await setChatInput(
        page,
        `Please help me with ${PROJECT_SKILL_TRIGGER} setup`,
      );
      await page.getByTestId("submit-button").click();
      await waitForPath(page, /\/conversations\/.+/, 30_000);
    });

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    await test.step("verify agent reply", async () => {
      await waitForNonUserMessageText(page, REPLY_TOKEN, 45_000);
    });

    await test.step("verify project skill activated", async () => {
      await assertSkillActivated(request, conversationId, PROJECT_SKILL_NAME);
    });
  });

  // ── Test 2: User skill loaded from ~/.openhands/skills/ ──────────

  test("user skill in ~/.openhands/skills/ triggers on matching keyword", async ({
    page,
    request,
  }) => {
    await ensureMockLLMProfile(request);

    await test.step("create user skill file", () => {
      writeUserSkill(USER_SKILL_NAME, USER_SKILL_TRIGGER);
      expect(
        existsSync(join(USER_SKILLS_DIR, USER_SKILL_NAME, "SKILL.md")),
      ).toBe(true);
    });

    await setupSkillTrajectory(request, "user-skill");

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    await test.step("send message with user skill trigger", async () => {
      await setChatInput(
        page,
        `I need help with ${USER_SKILL_TRIGGER} configuration`,
      );
      await page.getByTestId("submit-button").click();
      await waitForPath(page, /\/conversations\/.+/, 30_000);
    });

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    await test.step("verify agent reply", async () => {
      await waitForNonUserMessageText(page, REPLY_TOKEN, 45_000);
    });

    await test.step("verify user skill activated", async () => {
      await assertSkillActivated(request, conversationId, USER_SKILL_NAME);
    });
  });

  // ── Test 3: Deleted user skill not loaded in new conversation ────

  test("deleting a user skill removes it from subsequent conversations", async ({
    page,
    request,
  }) => {
    await ensureMockLLMProfile(request);

    // Ensure the skill file is gone (it was created by test 2)
    await test.step("delete user skill file", () => {
      removeUserSkill(USER_SKILL_NAME);
      expect(existsSync(join(USER_SKILLS_DIR, USER_SKILL_NAME))).toBe(false);
    });

    // Use a trajectory with NO padding (no skill should trigger)
    await setupNoSkillTrajectory(request, "deleted-skill");

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

    await test.step(
      "send message with deleted skill trigger keyword",
      async () => {
        await setChatInput(
          page,
          `Help me with ${USER_SKILL_TRIGGER} please`,
        );
        await page.getByTestId("submit-button").click();
        await waitForPath(page, /\/conversations\/.+/, 30_000);
      },
    );

    const conversationId = getConversationIdFromURL(page);
    conversationIds.add(conversationId);

    await test.step("verify agent reply", async () => {
      await waitForNonUserMessageText(page, REPLY_TOKEN, 45_000);
    });

    await test.step("verify deleted skill NOT activated", async () => {
      await assertSkillNotActivated(
        request,
        conversationId,
        USER_SKILL_NAME,
      );
    });
  });
});
