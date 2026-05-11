import { test } from "@playwright/test";

import {
  clickButtonByTestId,
  clickButtonByTestIdOrText,
  configureLiveAgentServer,
  dismissAnalyticsModal,
  enableLiveE2EFlags,
  EXPECTED_BASH_COMMAND,
  EXPECTED_BASH_OUTPUT_TOKEN,
  EXPECTED_REPLY_TOKEN,
  expandVisibleEventDetails,
  fillChatInput,
  getConversationIdFromURL,
  guardAgainstPostHogRequests,
  hasLiveLLMConfig,
  missingLiveLLMConfigMessage,
  openCreatedConversation,
  waitForAgentReply,
  waitForNonUserMessageText,
  waitForSuccessfulBashObservation,
  waitForTestId,
  waitForTestIdText,
} from "./utils/agent-server-conversation";

test.beforeEach(async ({ page }) => {
  await enableLiveE2EFlags(page);
});

test("runs a real LLM-backed Agent Server terminal conversation through the UI", async ({
  page,
  request,
}, testInfo) => {
  test.skip(!hasLiveLLMConfig, missingLiveLLMConfigMessage);

  await configureLiveAgentServer(request);
  const postHogGuard = await guardAgainstPostHogRequests(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await dismissAnalyticsModal(page);
  await clickButtonByTestIdOrText(
    page,
    "launch-new-conversation-button",
    "New Conversation",
  );
  await openCreatedConversation(page);
  await waitForTestId(page, "app-route");
  await waitForTestId(page, "interactive-chat-box");

  await fillChatInput(
    page,
    [
      "Use the terminal/bash tool exactly once.",
      `Run this exact command: ${EXPECTED_BASH_COMMAND}`,
      `After the command succeeds, reply with exactly this token and then finish: ${EXPECTED_REPLY_TOKEN}`,
      "Do not use any other tools. Do not add any other text in the final reply.",
    ].join("\n"),
  );
  await clickButtonByTestId(page, "submit-button");

  await waitForTestIdText(page, "user-message", EXPECTED_REPLY_TOKEN, 15_000);
  await waitForAgentReply(page);
  await waitForSuccessfulBashObservation(
    request,
    getConversationIdFromURL(page),
  );
  await expandVisibleEventDetails(page);
  await waitForNonUserMessageText(page, EXPECTED_BASH_OUTPUT_TOKEN);

  const screenshotPath = testInfo.outputPath("live-agent-response.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("live-agent-response", {
    path: screenshotPath,
    contentType: "image/png",
  });

  await postHogGuard.expectNoRequests();
});
