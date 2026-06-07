/**
 * Mock-LLM E2E tests: skill loading from project and user directories.
 *
 * These tests verify that the SDK's skill loading machinery works
 * end-to-end with the real agent-server stack:
 *
 * 1. **Project skills** from `{workspace}/.agents/skills/` are loaded
 *    alongside bundled public skills and trigger on matching keywords.
 *    The test creates a standalone git repo with the skill committed,
 *    then creates a conversation via API pointing at that repo. The
 *    agent-server creates a worktree from the repo, and since the skill
 *    is committed, `load_project_skills` finds it in the worktree.
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

import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  BACKEND_URL,
  SESSION_API_KEY,
  MOCK_LLM_AGENT_URL,
  seedLocalStorage,
  routeSessionApiKey,
  dismissAnalyticsModal,
  waitForNonUserMessageText,
  deleteConversation,
  registerTrajectory,
  activateTrajectory,
  resetMockLLM,
  setChatInput,
  waitForPath,
  getConversationIdFromURL,
} from "./utils/mock-llm-helpers";
import {
  createProjectSkillRepo,
  removeProjectSkillRepo,
  writeUserSkill,
  removeUserSkill,
  userSkillExists,
  userSkillDirExists,
} from "./utils/skill-test-helpers";

/**
 * Configure the mock LLM profile. Inlined from `ensureMockLLMProfile`
 * to work around a CI-specific TS6/Node24 type inference bug (TS2345)
 * where importing that function alongside `skill-test-helpers` causes
 * TypeScript to incorrectly resolve its signature.
 */
async function configureMockLLM(
  request: APIRequestContext,
  model = "openai/mock-test-model",
) {
  const settingsResp = await request.get(`${BACKEND_URL}/api/settings`, {
    headers: {
      "X-Session-API-Key": SESSION_API_KEY,
      "X-Expose-Secrets": "encrypted",
    },
  });
  if (settingsResp.ok()) {
    const settings = (await settingsResp.json()) as Record<string, unknown>;
    const llm = (
      settings?.agent_settings as Record<string, unknown> | undefined
    )?.llm as Record<string, unknown> | undefined;
    if (llm?.model === model && llm?.base_url === MOCK_LLM_AGENT_URL) return;
  }
  const patchResp = await request.patch(`${BACKEND_URL}/api/settings`, {
    headers: {
      "X-Session-API-Key": SESSION_API_KEY,
      "Content-Type": "application/json",
    },
    data: {
      agent_settings_diff: {
        llm: {
          model,
          api_key: "mock-api-key-for-testing",
          base_url: MOCK_LLM_AGENT_URL,
        },
      },
    },
  });
  expect(
    patchResp.ok(),
    `PATCH /api/settings failed: ${patchResp.status()}`,
  ).toBe(true);
}

/**
 * Create a conversation via the agent-server API with a specific working_dir.
 *
 * This bypasses the frontend's per-conversation hex-suffixed directory so the
 * conversation workspace points directly at the git repo created by
 * `createProjectSkillRepo`. The agent-server creates a worktree from the repo,
 * and `load_project_skills` discovers the committed skill files.
 */
async function createConversationWithWorkingDir(
  request: APIRequestContext,
  workingDir: string,
): Promise<string> {
  // Fetch current settings so we send the same agent config the UI would
  const settingsResp = await request.get(`${BACKEND_URL}/api/settings`, {
    headers: {
      "X-Session-API-Key": SESSION_API_KEY,
      "X-Expose-Secrets": "encrypted",
    },
  });
  expect(settingsResp.ok()).toBe(true);
  const settings = (await settingsResp.json()) as Record<string, unknown>;
  const agentSettings = settings.agent_settings as Record<string, unknown>;

  const resp = await request.post(`${BACKEND_URL}/api/conversations`, {
    headers: {
      "X-Session-API-Key": SESSION_API_KEY,
      "Content-Type": "application/json",
    },
    data: {
      agent_settings: {
        ...agentSettings,
        agent_context: {
          load_public_skills: false,
          load_user_skills: true,
          load_project_skills: true,
        },
      },
      workspace: { kind: "LocalWorkspace", working_dir: workingDir },
      worktree: true,
      max_iterations: 10,
      stuck_detection: true,
    },
  });
  expect(resp.ok(), `POST /api/conversations: ${resp.status()}`).toBe(true);
  const body = (await resp.json()) as Record<string, unknown>;
  return String(body.conversation_id);
}

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
    removeProjectSkillRepo(PROJECT_SKILL_NAME);
    removeUserSkill(USER_SKILL_NAME);
  });

  // ── Test 1: Project skill loaded from workspace ──────────────────
  //
  // Creates a standalone git repo with the skill committed, then creates
  // the conversation via API with that repo as the working_dir. The
  // agent-server creates a worktree from the repo, and the committed
  // skill file is present in it for `load_project_skills` to discover.

  test("project skill in workspace/.agents/skills/ triggers on matching keyword", async ({
    page,
    request,
  }) => {
    await configureMockLLM(request);

    // Create a git repo with the skill committed
    const repoDir = await test.step(
      "create git repo with project skill",
      () => {
        return createProjectSkillRepo(
          PROJECT_SKILL_NAME,
          PROJECT_SKILL_TRIGGER,
        );
      },
    );

    // Trajectory: padding for skill-analysis + agent reply
    await registerTrajectory(request, "project-skill", [
      { text: "" },
      { text: `Skill test complete. ${REPLY_TOKEN}` },
    ]);
    await activateTrajectory(request, "project-skill");

    // Create conversation via API pointing at the git repo
    const conversationId = await test.step(
      "create conversation with skill repo workspace",
      async () => {
        return createConversationWithWorkingDir(request, repoDir);
      },
    );
    conversationIds.add(conversationId);

    // Navigate to the conversation in the browser and send the message
    await routeSessionApiKey(page);
    await page.goto(`/conversations/${conversationId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissAnalyticsModal(page);

    await test.step("send message with project skill trigger", async () => {
      await setChatInput(
        page,
        `Please help me with ${PROJECT_SKILL_TRIGGER} setup`,
      );
      await page.getByTestId("submit-button").click();
    });

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
    await configureMockLLM(request);

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
    await configureMockLLM(request);

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
