import { test } from "@playwright/test";

import {
  clickButtonByTestId,
  clickButtonByTestIdOrText,
  configureLiveAgentServer,
  dismissAnalyticsModal,
  enableLiveE2EFlags,
  EXPECTED_REPLY_TOKEN,
  fillChatInput,
  hasLiveLLMConfig,
  missingLiveLLMConfigMessage,
  waitForAgentReply,
  waitForPath,
  waitForTestId,
  waitForTestIdText,
} from "./utils/agent-server-conversation";

test.beforeEach(async ({ page }) => {
  await enableLiveE2EFlags(page);
});

test("completes a real LLM-backed Agent Server conversation through the UI", async ({
  page,
  request,
}, testInfo) => {
  test.skip(!hasLiveLLMConfig, missingLiveLLMConfigMessage);

  await configureLiveAgentServer(request);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await dismissAnalyticsModal(page);
  await clickButtonByTestIdOrText(
    page,
    "launch-new-conversation-button",
    "New Conversation",
  );
  await waitForPath(page, /\/conversations\/.+/);
  await waitForTestId(page, "app-route");
  await waitForTestId(page, "interactive-chat-box");

  await fillChatInput(
    page,
    [
      `Reply with exactly this token and then finish: ${EXPECTED_REPLY_TOKEN}`,
      "Do not run tools. Do not add any other text.",
    ].join("\n"),
  );
  await clickButtonByTestId(page, "submit-button");

  await waitForTestIdText(page, "user-message", EXPECTED_REPLY_TOKEN, 15_000);
  await waitForAgentReply(page);

  const screenshotPath = testInfo.outputPath("live-agent-response.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach("live-agent-response", {
    path: screenshotPath,
    contentType: "image/png",
  });
});
