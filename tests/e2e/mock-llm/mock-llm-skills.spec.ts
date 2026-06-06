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
import {
  WORKSPACE_DIR,
  writeSkill,
  writeUserSkill,
  removeSkill,
  removeUserSkill,
  skillExists,
  userSkillExists,
  userSkillDirExists,
} from "./utils/skill-test-helpers";

// ── Shared constants ─────────────────────────────────────────────────

const REPLY_TOKEN = "SKILLS_E2E_REPLY_OK";

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

  test.afterEach(async ({ page, request }) => {
    const match = page.url().match(/\/conversations\/([^/?#]+)/);
    if (match?.[1]) conversationIds.add(decodeURIComponent(match[1]));

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
    removeSkill(WORKSPACE_DIR, PROJECT_SKILL_NAME);
    removeUserSkill(USER_SKILL_NAME);
  });

  // ── Test 1: Project skill loaded from workspace ──────────────────

  test("project skill in workspace/.agents/skills/ triggers on matching keyword", async ({
    page,
    request,
  }) => {
    await ensureMockLLMProfile(request);

    await test.step("create project skill file", () => {
      writeSkill(WORKSPACE_DIR, PROJECT_SKILL_NAME, PROJECT_SKILL_TRIGGER);
      expect(skillExists(WORKSPACE_DIR, PROJECT_SKILL_NAME)).toBe(true);
    });

    // Trajectory: padding for skill-analysis + agent reply
    await registerTrajectory(request, "project-skill", [
      { text: "" },
      { text: `Skill test complete. ${REPLY_TOKEN}` },
    ]);
    await activateTrajectory(request, "project-skill");

    await routeSessionApiKey(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);

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
            if (!resp.ok()) return `HTTP ${resp.status()}`;
            const body = (await resp.json()) as { items?: unknown[] };
            for (const item of body.items ?? []) {
              const e = item as Record<string, unknown>;
              const skills =
                (e.activated_skills as string[] | undefined) ??
                (e.activated_microagents as string[] | undefined);
              if (skills?.includes(PROJECT_SKILL_NAME)) return "FOUND";
            }
            return "NOT_FOUND";
          },
          {
            message: `expected "${PROJECT_SKILL_NAME}" in activated_skills`,
            intervals: [1_000, 2_000, 3_000, 5_000],
            timeout: 25_000,
          },
        )
        .toBe("FOUND");
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
      expect(userSkillExists(USER_SKILL_NAME)).toBe(true);
    });

    await registerTrajectory(request, "user-skill", [
      { text: "" },
      { text: `Skill test complete. ${REPLY_TOKEN}` },
    ]);
    await activateTrajectory(request, "user-skill");

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
            if (!resp.ok()) return `HTTP ${resp.status()}`;
            const body = (await resp.json()) as { items?: unknown[] };
            for (const item of body.items ?? []) {
              const e = item as Record<string, unknown>;
              const skills =
                (e.activated_skills as string[] | undefined) ??
                (e.activated_microagents as string[] | undefined);
              if (skills?.includes(USER_SKILL_NAME)) return "FOUND";
            }
            return "NOT_FOUND";
          },
          {
            message: `expected "${USER_SKILL_NAME}" in activated_skills`,
            intervals: [1_000, 2_000, 3_000, 5_000],
            timeout: 25_000,
          },
        )
        .toBe("FOUND");
    });
  });

  // ── Test 3: Deleted user skill not loaded in new conversation ────

  test("deleting a user skill removes it from subsequent conversations", async ({
    page,
    request,
  }) => {
    await ensureMockLLMProfile(request);

    await test.step("delete user skill file", () => {
      removeUserSkill(USER_SKILL_NAME);
      expect(userSkillDirExists(USER_SKILL_NAME)).toBe(false);
    });

    // No skill should trigger → no padding response needed
    await registerTrajectory(request, "deleted-skill", [
      { text: `No skill triggered. ${REPLY_TOKEN}` },
    ]);
    await activateTrajectory(request, "deleted-skill");

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
      // Wait for at least one agent reply event
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
            return (body.items ?? []).some((item) => {
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

      // Verify the deleted skill was NOT activated
      const resp = await request.get(
        `${BACKEND_URL}/api/conversations/${encodeURIComponent(conversationId)}/events/search`,
        {
          headers: { "X-Session-API-Key": SESSION_API_KEY },
          params: { limit: "100" },
        },
      );
      expect(resp.ok()).toBe(true);
      const body = (await resp.json()) as { items?: unknown[] };
      for (const item of body.items ?? []) {
        const e = item as Record<string, unknown>;
        const skills =
          (e.activated_skills as string[] | undefined) ??
          (e.activated_microagents as string[] | undefined);
        expect(
          skills?.includes(USER_SKILL_NAME) ?? false,
          `"${USER_SKILL_NAME}" should NOT be in activated_skills`,
        ).toBe(false);
      }
    });
  });
});
