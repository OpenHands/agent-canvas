import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  BACKEND_URL,
  clickButtonByTestId,
  configureLiveAgentServer,
  dismissAnalyticsModal,
  enableLiveE2EFlags,
  EXPECTED_BASH_COMMAND,
  EXPECTED_BASH_OUTPUT_TOKEN,
  EXPECTED_REPLY_TOKEN,
  expandVisibleEventDetails,
  fillChatInput,
  getConversationIdFromURL,
  getLiveArtifactMask,
  getOptionalConversationIdFromURL,
  guardAgainstPostHogRequests,
  hasLiveLLMConfig,
  missingLiveLLMConfigMessage,
  openCreatedConversation,
  routeBackendSessionApiKeyFor,
  sessionApiKey,
  waitForAgentReply,
  waitForNonUserMessageText,
  waitForSuccessfulBashObservation,
  waitForTestId,
} from "./utils/agent-server-conversation";

const DOCKER_BACKEND_URL =
  process.env.LIVE_E2E_DOCKER_BACKEND_URL ?? "http://127.0.0.1:18002";
const QA_PROMPT = [
  "Use the terminal/bash tool exactly once.",
  `Run this exact command: ${EXPECTED_BASH_COMMAND}`,
  `After the command succeeds, reply with exactly this token and then finish: ${EXPECTED_REPLY_TOKEN}`,
  "Do not use any other tools. Do not add any other text in the final reply.",
].join("\n");

test.describe.configure({ mode: "serial" });

test.describe("live onboarding with local and Docker backends", () => {
  const createdConversationIdsByBackend = new Map<string, Set<string>>([
    [BACKEND_URL, new Set<string>()],
    [DOCKER_BACKEND_URL, new Set<string>()],
  ]);

  async function deleteConversation(
    request: APIRequestContext,
    backendUrl: string,
    conversationId: string,
  ) {
    const response = await request.delete(
      `${backendUrl}/api/conversations/${encodeURIComponent(conversationId)}`,
      {
        headers: {
          "X-Session-API-Key": sessionApiKey,
        },
      },
    );
    if (response.ok() || response.status() === 404) {
      createdConversationIdsByBackend.get(backendUrl)?.delete(conversationId);
      return;
    }

    throw new Error(
      `Failed to clean up live E2E conversation ${conversationId} on ${backendUrl}: ${response.status()}`,
    );
  }

  async function cleanupKnownConversations(request: APIRequestContext) {
    const cleanupErrors: string[] = [];

    for (const [
      backendUrl,
      conversationIds,
    ] of createdConversationIdsByBackend) {
      for (const conversationId of Array.from(conversationIds)) {
        try {
          await deleteConversation(request, backendUrl, conversationId);
        } catch (error) {
          cleanupErrors.push(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }

    if (cleanupErrors.length > 0) {
      throw new Error(cleanupErrors.join("\n"));
    }
  }

  async function waitForStep(page: Page, step: number) {
    await expect(page.getByTestId("onboarding-slide-rail")).toHaveAttribute(
      "data-current-step",
      String(step),
      { timeout: 30_000 },
    );
  }

  async function waitForBackendReady(
    request: APIRequestContext,
    backendUrl: string,
  ) {
    await expect
      .poll(
        async () => {
          try {
            const response = await request.get(`${backendUrl}/server_info`, {
              headers: {
                "X-Session-API-Key": sessionApiKey,
              },
              timeout: 5_000,
            });
            return response.ok();
          } catch {
            return false;
          }
        },
        { timeout: 180_000 },
      )
      .toBe(true);
  }

  async function waitForActiveBackendHost(page: Page, expectedHost: string) {
    await expect
      .poll(
        async () =>
          page.evaluate((host) => {
            const activeRaw = window.localStorage.getItem(
              "openhands-active-backend",
            );
            const backendsRaw =
              window.localStorage.getItem("openhands-backends");
            if (!activeRaw || !backendsRaw) return false;

            const active = JSON.parse(activeRaw) as { backendId?: string };
            const backends = JSON.parse(backendsRaw) as Array<{
              id?: string;
              host?: string;
            }>;
            return backends.some(
              (backend) =>
                backend.id === active.backendId && backend.host === host,
            );
          }, expectedHost),
        { timeout: 30_000 },
      )
      .toBe(true);
  }

  async function runQaPromptInCurrentConversation(
    page: Page,
    request: APIRequestContext,
    backendUrl: string,
    artifactName: string,
    testInfo: TestInfo,
  ) {
    const conversationId = getConversationIdFromURL(page);
    createdConversationIdsByBackend.get(backendUrl)?.add(conversationId);
    await waitForTestId(page, "chat-interface");
    await waitForTestId(page, "interactive-chat-box");

    await waitForAgentReply(page);
    await waitForSuccessfulBashObservation(request, conversationId, backendUrl);
    await expandVisibleEventDetails(page);
    await waitForNonUserMessageText(page, EXPECTED_BASH_OUTPUT_TOKEN);

    const screenshotPath = testInfo.outputPath(`${artifactName}.png`);
    await page.getByTestId("chat-interface").screenshot({
      path: screenshotPath,
      mask: getLiveArtifactMask(page),
    });
    await testInfo.attach(artifactName, {
      path: screenshotPath,
      contentType: "image/png",
    });
  }

  async function hasUserPrompt(page: Page) {
    return page
      .evaluate((expectedCommand) => {
        const userMessages = Array.from(
          document.querySelectorAll('[data-testid="user-message"]'),
        );
        return userMessages.some((element) =>
          element.textContent?.includes(expectedCommand),
        );
      }, EXPECTED_BASH_COMMAND)
      .catch(() => false);
  }

  async function sendPromptInConversationIfNeeded(page: Page) {
    await waitForTestId(page, "interactive-chat-box");
    const promptAlreadySent = await expect
      .poll(() => hasUserPrompt(page), { timeout: 5_000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (promptAlreadySent) return;

    await fillChatInput(page, QA_PROMPT);
    await clickButtonByTestId(page, "submit-button");
  }

  test.beforeEach(async ({ page }) => {
    await enableLiveE2EFlags(page, { skipOnboarding: false });
  });

  test.afterEach(async ({ page, request }) => {
    const conversationId = getOptionalConversationIdFromURL(page);
    if (conversationId) {
      const currentBackend = await page
        .evaluate(
          ({ dockerBackendUrl, fallbackBackendUrl }) => {
            const activeRaw = window.localStorage.getItem(
              "openhands-active-backend",
            );
            const backendsRaw =
              window.localStorage.getItem("openhands-backends");
            if (!activeRaw || !backendsRaw) return fallbackBackendUrl;

            const active = JSON.parse(activeRaw) as { backendId?: string };
            const backends = JSON.parse(backendsRaw) as Array<{
              id?: string;
              host?: string;
            }>;
            const backend = backends.find(
              (item) => item.id === active.backendId,
            );
            return backend?.host === dockerBackendUrl
              ? dockerBackendUrl
              : fallbackBackendUrl;
          },
          {
            dockerBackendUrl: DOCKER_BACKEND_URL,
            fallbackBackendUrl: BACKEND_URL,
          },
        )
        .catch(() => BACKEND_URL);
      createdConversationIdsByBackend.get(currentBackend)?.add(conversationId);
    }

    await cleanupKnownConversations(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanupKnownConversations(request);
  });

  test("completes onboarding, then runs local and Docker LLM conversations", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(!hasLiveLLMConfig, missingLiveLLMConfigMessage);

    await configureLiveAgentServer(request, BACKEND_URL);
    await routeBackendSessionApiKeyFor(page, BACKEND_URL);
    await routeBackendSessionApiKeyFor(page, DOCKER_BACKEND_URL);
    const postHogGuard = await guardAgainstPostHogRequests(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissAnalyticsModal(page);
    await expect(page.getByTestId("onboarding-modal")).toBeVisible({
      timeout: 30_000,
    });

    await waitForStep(page, 0);
    await clickButtonByTestId(page, "onboarding-agent-next");

    await waitForStep(page, 1);
    await expect(page.getByTestId("choose-backend-local")).toHaveAttribute(
      "data-selected",
      "true",
    );
    await page.getByTestId("choose-backend-docker-toggle").click();
    await page.getByTestId("choose-backend-docker-path").fill(process.cwd());
    await clickButtonByTestId(page, "choose-backend-docker-start");
    await expect(
      page.getByTestId("choose-backend-docker-status-running"),
    ).toBeVisible({ timeout: 90_000 });
    await waitForBackendReady(request, DOCKER_BACKEND_URL);
    await configureLiveAgentServer(request, DOCKER_BACKEND_URL);

    await clickButtonByTestId(page, "onboarding-backend-next");

    await waitForStep(page, 2);
    await clickButtonByTestId(page, "onboarding-llm-next");

    await waitForStep(page, 3);
    await configureLiveAgentServer(request, BACKEND_URL);
    await configureLiveAgentServer(request, DOCKER_BACKEND_URL);
    await page.getByTestId("onboarding-hello-input").fill(QA_PROMPT);
    await clickButtonByTestId(page, "onboarding-hello-launch");

    await openCreatedConversation(page);
    await runQaPromptInCurrentConversation(
      page,
      request,
      BACKEND_URL,
      "live-onboarding-local-response",
      testInfo,
    );

    await page.getByTestId("backend-selector").click();
    await page
      .getByRole("option", {
        name: /ONBOARDING\$CHOOSE_BACKEND_DOCKER_TITLE|Docker Backend/i,
      })
      .click();
    await expect(page).toHaveURL(/\/conversations\/?$/);
    await waitForActiveBackendHost(page, DOCKER_BACKEND_URL);
    await waitForTestId(page, "home-chat-launcher");
    await fillChatInput(page, QA_PROMPT);
    await clickButtonByTestId(page, "submit-button");
    await openCreatedConversation(page);
    await sendPromptInConversationIfNeeded(page);

    await runQaPromptInCurrentConversation(
      page,
      request,
      DOCKER_BACKEND_URL,
      "live-onboarding-docker-response",
      testInfo,
    );

    await postHogGuard.expectNoRequests();
  });
});
