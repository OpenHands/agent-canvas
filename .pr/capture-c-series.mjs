import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://127.0.0.1:3101";
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:18110";
const SESSION_API_KEY =
  process.env.SESSION_API_KEY ?? "codex-mcp-gif-isolated-key";
const MOCK_LLM_URL = process.env.MOCK_LLM_URL ?? "http://127.0.0.1:19999";
const HUB_URL = process.env.HUB_URL ?? "http://localhost:8081";
const HUB_API_URL = process.env.HUB_API_URL ?? "http://127.0.0.1:8081";
const HUB_MCP_URL = process.env.HUB_MCP_URL ?? "http://127.0.0.1:8081/api/mcp";
const HUB_TOKEN = process.env.HUB_TOKEN ?? "dev-token";
const FIXTURE_DOCKER_HOST = process.env.FIXTURE_DOCKER_HOST ?? "172.18.0.1";
const MOCK_MODEL = "openai/mock-test-model";
const MOCK_LLM_API_KEY = "mock-api-key-for-testing";
const RUN_TAG =
  process.env.RUN_TAG ??
  new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
const PR_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(PR_DIR, "..");

const flows = [
  {
    id: "c1",
    title: "c1: Integrations hub + unauthenticated weather MCP",
    integrationKey: `c1_weather_${RUN_TAG}`,
    displayName: `C1 Weather ${RUN_TAG}`,
    hubMode: "custom",
    fixtureUrl: `http://${FIXTURE_DOCKER_HOST}:19200/mcp`,
    credential: null,
    toolName: "weather_forecast",
    toolArgs: { city: "Pittsburgh" },
    prompt:
      "Use the integrations hub weather MCP to get the Pittsburgh forecast.",
    finalText: "C1 integrations hub weather MCP complete.",
    successToken: "weather_fixture_success",
  },
  {
    id: "c2",
    title: "c2: Integrations hub + bearer-token MCP",
    integrationKey: `c2_elevenlabs_${RUN_TAG}`,
    displayName: `C2 ElevenLabs ${RUN_TAG}`,
    hubMode: "custom",
    fixtureUrl: `http://${FIXTURE_DOCKER_HOST}:19201/mcp`,
    credential: { bearerToken: "elevenlabs-test-token" },
    toolName: "elevenlabs_voice_note",
    toolArgs: { text: "Canvas demo voice note" },
    prompt: "Use the integrations hub elevenlabs MCP to draft a voice note.",
    finalText: "C2 integrations hub bearer-token MCP complete.",
    successToken: "elevenlabs_fixture_success",
  },
  {
    id: "c3",
    title: "c3: Integrations hub + header-authenticated MCP",
    integrationKey: `c3_datadog_${RUN_TAG}`,
    displayName: `C3 Datadog ${RUN_TAG}`,
    hubMode: "custom",
    fixtureUrl: `http://${FIXTURE_DOCKER_HOST}:19202/mcp`,
    credential: { headerName: "DD-API-KEY", headerSecret: "datadog-api-key" },
    toolName: "datadog_metric_snapshot",
    toolArgs: { service: "canvas-api" },
    prompt:
      "Use the integrations hub datadog MCP to inspect canvas-api metrics.",
    finalText: "C3 integrations hub header-auth MCP complete.",
    successToken: "datadog_fixture_success",
  },
  {
    id: "c4",
    title: "c4: Integrations hub + OAuth client-id/secret MCP",
    integrationKey: `c4-notion-oauth-${RUN_TAG}`,
    displayName: `C4 Notion OAuth ${RUN_TAG}`,
    hubMode: "managed-oauth",
    fixtureUrl: `http://${FIXTURE_DOCKER_HOST}:19203/mcp`,
    managedConnector: {
      description: "Static client-id and client-secret OAuth MCP fixture.",
      oauthClientId: "notion-client",
      oauthClientSecret: "notion-secret",
      oauthConfig: {
        authorizationUrl: `http://${FIXTURE_DOCKER_HOST}:19203/authorize`,
        tokenUrl: `http://${FIXTURE_DOCKER_HOST}:19203/token`,
        scopes: ["read:mock"],
        pkce: true,
        clientAuthentication: "body",
      },
    },
    toolName: "notion_page_lookup",
    toolArgs: { title: "Roadmap" },
    prompt: "Use the integrations hub notion MCP to look up the Roadmap page.",
    finalText: "C4 integrations hub OAuth client-secret MCP complete.",
    successToken: "notion_fixture_success",
  },
  {
    id: "c5",
    title: "c5: Integrations hub + dynamic OAuth MCP",
    integrationKey: `c5-linear-dynamic-${RUN_TAG}`,
    displayName: `C5 Linear Dynamic ${RUN_TAG}`,
    hubMode: "managed-oauth",
    fixtureUrl: `http://${FIXTURE_DOCKER_HOST}:19204/mcp`,
    managedConnector: {
      description: "Dynamic OAuth client registration MCP fixture.",
      oauthConfig: {
        authorizationUrl: `http://${FIXTURE_DOCKER_HOST}:19204/authorize`,
        tokenUrl: `http://${FIXTURE_DOCKER_HOST}:19204/token`,
        registrationUrl: `http://${FIXTURE_DOCKER_HOST}:19204/register`,
        scopes: ["read:mock"],
        pkce: true,
        clientAuthentication: "none",
      },
    },
    toolName: "linear_issue_summary",
    toolArgs: { issue_key: "LIN-42" },
    prompt: "Use the integrations hub linear MCP to summarize issue LIN-42.",
    finalText: "C5 integrations hub dynamic OAuth MCP complete.",
    successToken: "linear_fixture_success",
  },
];

async function adminPost(pathname, body = undefined) {
  const response = await fetch(`${MOCK_LLM_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Mock LLM ${pathname} failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.json().catch(() => ({}));
}

async function registerTrajectory(flow) {
  const hubToolName = `${flow.integrationKey}__${flow.toolName}`;
  await adminPost("/admin/reset");
  await adminPost("/admin/trajectory/register", {
    name: flow.id,
    turns: [
      { tool_call: { name: hubToolName, arguments: flow.toolArgs } },
      {
        text: `${flow.finalText} The MCP observation contains ${flow.successToken}.`,
      },
    ],
  });
  await adminPost("/admin/trajectory/activate", { name: flow.id });
}

async function setupPage() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--renderer-process-limit=1",
      "--single-process",
      "--no-zygote",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ({ apiKey, backendUrl, hubToken }) => {
      window.localStorage.setItem("analytics-consent", "false");
      window.localStorage.setItem("openhands-telemetry-consent", "denied");
      window.localStorage.setItem("openhands-telemetry-first-use", "true");
      window.localStorage.setItem("openhands-onboarded", "1");
      window.localStorage.setItem("integrations-hub-openhands-token", hubToken);

      const active = { backendId: "default-local", orgId: null };
      window.localStorage.setItem(
        "openhands-backends",
        JSON.stringify([
          {
            id: "default-local",
            name: "Local",
            host: backendUrl,
            apiKey,
            kind: "local",
          },
        ]),
      );
      window.localStorage.setItem(
        "openhands-active-backend",
        JSON.stringify(active),
      );
      window.sessionStorage.setItem(
        "openhands-active-backend",
        JSON.stringify(active),
      );
    },
    {
      apiKey: SESSION_API_KEY,
      backendUrl: BACKEND_URL,
      hubToken: HUB_TOKEN,
    },
  );
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const backendOrigin = new URL(BACKEND_URL).origin;
    const frontendOrigin = new URL(FRONTEND_URL).origin;
    const hubOrigin = new URL(HUB_URL).origin;
    const isCanvasBackend =
      url.origin === backendOrigin ||
      (url.origin === frontendOrigin && url.pathname.startsWith("/api/"));
    const isHubBackend =
      url.origin === hubOrigin && url.pathname.startsWith("/api/");
    if (!isCanvasBackend && !isHubBackend) {
      await route.continue();
      return;
    }
    await route.continue({
      headers: {
        ...request.headers(),
        ...(isCanvasBackend ? { "X-Session-API-Key": SESSION_API_KEY } : {}),
        ...(isHubBackend ? { Authorization: `Bearer ${HUB_TOKEN}` } : {}),
      },
    });
  });
  return { browser, context, page };
}

async function waitForTestId(page, testId, timeout = 30_000) {
  await page.getByTestId(testId).waitFor({ state: "visible", timeout });
}

async function dismissBlockingModals(page) {
  try {
    const form = page.getByTestId("telemetry-consent-form");
    await form.waitFor({ state: "visible", timeout: 2_000 });
    await page.getByTestId("confirm-telemetry-preferences").click();
    await form.waitFor({ state: "hidden", timeout: 5_000 });
  } catch {}
  try {
    const form = page.getByTestId("user-capture-consent-form");
    await form.waitFor({ state: "visible", timeout: 2_000 });
    await form.getByRole("button", { name: "Confirm preferences" }).click();
    await form.waitFor({ state: "hidden", timeout: 5_000 });
  } catch {}
  try {
    const skip = page.getByTestId("onboarding-skip");
    await skip.waitFor({ state: "visible", timeout: 2_000 });
    await skip.click();
    await page.getByTestId("onboarding-modal").waitFor({
      state: "hidden",
      timeout: 5_000,
    });
  } catch {}
  try {
    const close = page.getByTestId("onboarding-hello-close");
    await close.waitFor({ state: "visible", timeout: 2_000 });
    await close.click();
    await page.getByTestId("onboarding-modal").waitFor({
      state: "hidden",
      timeout: 5_000,
    });
  } catch {}
}

async function gotoPage(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(1_000 * attempt).catch(() => {});
    }
  }
  throw lastError;
}

async function selectDropdownOption(page, comboboxLabel, optionText) {
  const combobox = page.getByRole("combobox", { name: comboboxLabel });
  await combobox.waitFor({ state: "visible", timeout: 10_000 });
  await combobox.click();
  try {
    await combobox.fill("");
  } catch {}
  const option = page.getByRole("option", { name: optionText });
  await option.waitFor({ state: "visible", timeout: 10_000 });
  await option.click();
}

async function setChatInput(page, text) {
  await page.evaluate((inputText) => {
    const el = document.querySelector('[data-testid="chat-input"]');
    if (!(el instanceof HTMLElement)) {
      throw new Error("chat-input not found");
    }
    el.focus();
    el.textContent = inputText;
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: inputText,
        inputType: "insertText",
      }),
    );
  }, text);
}

async function waitForBodyText(page, text, timeout = 60_000) {
  await page.locator("body").filter({ hasText: text }).waitFor({ timeout });
}

async function waitForOutputText(page, text, timeout = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = await page.evaluate((needle) => {
      const selectors = [
        '[data-testid="agent-message"]',
        '[data-testid="environment-message"]',
        '[data-testid="model-messages"]',
        '[data-testid="event-group"]',
        '[data-testid="error-message-banner"]',
      ];
      return selectors.some((selector) =>
        Array.from(document.querySelectorAll(selector)).some((node) =>
          node.textContent?.includes(needle),
        ),
      );
    }, text);
    if (found) return;
    await page.waitForTimeout(1_000);
  }
  throw new Error(`Timed out waiting for output text: ${text}`);
}

function frameDir(flowId) {
  return path.join(PR_DIR, "frames", flowId);
}

async function capture(page, flowId, label) {
  const dir = frameDir(flowId);
  fs.mkdirSync(dir, { recursive: true });
  const count = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".png")).length;
  const file = path.join(
    dir,
    `${String(count + 1).padStart(3, "0")}-${label}.png`,
  );
  await page.screenshot({ path: file, fullPage: false, timeout: 90_000 });
  return file;
}

function makeGif(flowId) {
  const frames = fs
    .readdirSync(frameDir(flowId))
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => path.join(frameDir(flowId), name));
  const out = path.join(PR_DIR, `${flowId}.gif`);
  const script = String.raw`
from PIL import Image
import sys
out = sys.argv[1]
paths = sys.argv[2:]
imgs = []
for path in paths:
    img = Image.open(path).convert("RGB")
    max_width = 960
    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.Resampling.LANCZOS)
    imgs.append(img.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))
durations = [900] * len(imgs)
if durations:
    durations[-1] = 1800
imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=durations, loop=0, optimize=True)
`;
  const result = spawnSync("python", ["-c", script, out, ...frames], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`GIF creation failed for ${flowId}: ${result.stderr}`);
  }
  return out;
}

async function ensureLlmSettings() {
  const profileName = `mcp-gif-c-${RUN_TAG}`;
  const saveResponse = await fetch(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(profileName)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": SESSION_API_KEY,
      },
      body: JSON.stringify({
        llm: {
          model: MOCK_MODEL,
          api_key: MOCK_LLM_API_KEY,
          base_url: MOCK_LLM_URL,
        },
        include_secrets: true,
      }),
    },
  );
  if (!saveResponse.ok) {
    throw new Error(
      `POST /api/profiles failed: ${saveResponse.status} ${await saveResponse.text()}`,
    );
  }

  const activateResponse = await fetch(
    `${BACKEND_URL}/api/profiles/${encodeURIComponent(profileName)}/activate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": SESSION_API_KEY,
      },
    },
  );
  if (!activateResponse.ok) {
    throw new Error(
      `POST /api/profiles/activate failed: ${activateResponse.status} ${await activateResponse.text()}`,
    );
  }

  const response = await fetch(`${BACKEND_URL}/api/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Session-API-Key": SESSION_API_KEY,
    },
    body: JSON.stringify({
      agent_settings_diff: {
        agent_kind: "openhands",
        agent: "CodeActAgent",
        llm: {
          model: MOCK_MODEL,
          api_key: MOCK_LLM_API_KEY,
          base_url: MOCK_LLM_URL,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `PATCH /api/settings failed: ${response.status} ${await response.text()}`,
    );
  }
}

async function cleanupStaleHubMcpServers() {
  const settingsResponse = await fetch(`${BACKEND_URL}/api/settings`, {
    headers: { "X-Session-API-Key": SESSION_API_KEY },
  });
  if (!settingsResponse.ok) {
    throw new Error(
      `GET /api/settings failed: ${settingsResponse.status} ${await settingsResponse.text()}`,
    );
  }
  const settings = await settingsResponse.json();
  const currentConfig = settings.agent_settings?.mcp_config ?? {};
  const staleNames = Object.keys(currentConfig).filter((name) =>
    /^c[1-5]_hub_\d+/.test(name),
  );
  if (staleNames.length === 0) {
    return;
  }

  const response = await fetch(`${BACKEND_URL}/api/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Session-API-Key": SESSION_API_KEY,
    },
    body: JSON.stringify({
      agent_settings_diff: {
        mcp_config: Object.fromEntries(staleNames.map((name) => [name, null])),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `PATCH /api/settings mcp_config failed: ${response.status} ${await response.text()}`,
    );
  }
}

async function hubApi(pathname, options = {}) {
  const response = await fetch(`${HUB_API_URL}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${HUB_TOKEN}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new Error(
      `Hub ${pathname} failed: ${response.status} ${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`,
    );
  }
  return payload;
}

async function ensureManagedConnector(flow) {
  if (flow.hubMode !== "managed-oauth") return;
  await hubApi("/api/managed-connectors", {
    method: "POST",
    body: JSON.stringify({
      slug: flow.integrationKey,
      name: flow.displayName,
      description: flow.managedConnector.description,
      categories: ["QA"],
      authModes: ["oauth2"],
      authStrategy: "oauth2",
      provider: "mcp",
      serverUrl: flow.fixtureUrl,
      oauthConfigured: true,
      oauthClientId: flow.managedConnector.oauthClientId,
      oauthClientSecret: flow.managedConnector.oauthClientSecret,
      oauthConfig: flow.managedConnector.oauthConfig,
      credentialLabel: `Connect ${flow.displayName}`,
      credentialPlaceholder: `Connect ${flow.displayName}`,
      credentialHelp: "Use the fixture OAuth server.",
      tools: [],
      enabled: true,
    }),
  }).catch(async (error) => {
    if (!String(error.message).includes("409")) throw error;
  });
}

async function getHubAgentKey() {
  const response = await hubApi("/api/user/agent-key", {
    method: "GET",
  });
  if (!response?.apiKey) {
    throw new Error(
      `Hub agent key response missing apiKey: ${JSON.stringify(response)}`,
    );
  }
  return response.apiKey;
}

async function addCustomHubIntegration(page, flow) {
  await gotoPage(page, `${HUB_URL}/integrations?showIntegrationWizard=1`);
  await waitForBodyText(page, "Integrations");
  await capture(page, flow.id, "hub-integrations");

  const customButton = page.getByRole("button", {
    name: /Use a custom MCP server URL instead/i,
  });
  await customButton.waitFor({ state: "visible", timeout: 20_000 });
  await customButton.click();
  await page.getByPlaceholder("my-mcp").waitFor({ state: "visible" });
  await capture(page, flow.id, "hub-custom-form");

  await page.getByPlaceholder("my-mcp").fill(flow.integrationKey);
  await page.getByPlaceholder("My MCP").fill(flow.displayName);
  await page.getByPlaceholder("https://example.com/mcp").fill(flow.fixtureUrl);
  if (flow.credential) {
    await page.getByText("Add", { exact: true }).click();
    await page.getByPlaceholder("OAuth or bearer token").waitFor({
      state: "visible",
      timeout: 10_000,
    });
  }
  if (flow.credential?.bearerToken) {
    await page
      .getByPlaceholder("OAuth or bearer token")
      .fill(flow.credential.bearerToken);
  }
  if (flow.credential?.headerSecret) {
    await page
      .getByPlaceholder("Secret used with a header")
      .fill(flow.credential.headerSecret);
    await page.getByPlaceholder("X-API-Key").fill(flow.credential.headerName);
  }
  await capture(page, flow.id, "hub-custom-filled");

  await page.getByRole("button", { name: "Discover tools" }).click();
  await waitForBodyText(page, flow.toolName, 60_000);
  await capture(page, flow.id, "hub-tools-discovered");

  await page
    .getByRole("button", { name: /Add integration|Create integration/i })
    .click();
  await waitForBodyText(page, flow.displayName, 60_000);
  await waitForBodyText(page, flow.toolName, 60_000);
  await capture(page, flow.id, "hub-integration-created");
}

async function addManagedOauthIntegration(page, flow) {
  await ensureManagedConnector(flow);
  await gotoPage(
    page,
    `${HUB_URL}/integrations?showIntegrationWizard=1&managedConnector=${flow.integrationKey}`,
  );
  await waitForBodyText(page, flow.displayName, 30_000);
  await capture(page, flow.id, "hub-managed-form");

  const connectButton = page.getByRole("button", { name: /^Connect$/ }).first();
  await connectButton.waitFor({ state: "visible", timeout: 20_000 });
  await connectButton.click();
  await page.waitForURL(/\/integrations/, { timeout: 60_000 });
  await waitForBodyText(page, "Connected", 60_000);
  await capture(page, flow.id, "hub-oauth-connected");

  await page.getByRole("button", { name: "Discover tools" }).click();
  await waitForBodyText(page, flow.toolName, 60_000);
  await capture(page, flow.id, "hub-tools-discovered");

  await page
    .getByRole("button", { name: /Add integration|Create integration/i })
    .click();
  await waitForBodyText(page, flow.displayName, 60_000);
  await waitForBodyText(page, flow.toolName, 60_000);
  await capture(page, flow.id, "hub-integration-created");
}

async function showAgentConnection(page, flow) {
  await gotoPage(page, `${HUB_URL}/agent-connection`);
  await waitForBodyText(page, "Agent Connection", 30_000);
  await capture(page, flow.id, "hub-agent-connection");
  const revealButton = page.getByRole("button", { name: /Reveal/i }).first();
  if (await revealButton.isVisible().catch(() => false)) {
    await revealButton.click();
    await page.waitForTimeout(500);
    await capture(page, flow.id, "hub-agent-key-revealed");
  }
}

async function installHubMcpInCanvas(page, flow, hubAgentKey) {
  const serverName = `${flow.id}_hub_${RUN_TAG}`;
  await gotoPage(page, `${FRONTEND_URL}/mcp`);
  await dismissBlockingModals(page);
  await waitForTestId(page, "mcp-page", 180_000);
  await capture(page, flow.id, "canvas-mcp-page");

  await page.getByTestId("mcp-add-custom-server").click({ noWaitAfter: true });
  await waitForTestId(page, "mcp-custom-editor");
  await capture(page, flow.id, "canvas-custom-modal");

  await page.getByTestId("server-type-dropdown").fill("SHTTP");
  await page.getByTestId("server-type-dropdown").press("Enter");
  await page.getByTestId("server-name-input").fill(serverName);
  await page
    .getByTestId("url-input")
    .fill(`${HUB_MCP_URL}?run=${RUN_TAG}-${flow.id}`);
  await selectDropdownOption(page, /Authentication/i, "Bearer token");
  await page.getByTestId("api-key-input").fill(hubAgentKey);
  await capture(page, flow.id, "canvas-hub-auth-filled");

  await page
    .getByTestId("mcp-custom-editor")
    .getByRole("button", { name: "Add Server" })
    .click({ noWaitAfter: true });
  try {
    await page.getByTestId("mcp-custom-editor").waitFor({
      state: "hidden",
      timeout: 60_000,
    });
  } catch (error) {
    await capture(page, flow.id, "canvas-install-still-open").catch(() => {});
    const modalText = await page
      .getByTestId("mcp-custom-editor")
      .innerText()
      .catch(() => "");
    throw new Error(
      `Hub MCP install modal did not close for ${flow.id}. Text:\n${modalText}`,
      { cause: error },
    );
  }
  await waitForTestId(page, "mcp-installed-list");
  await capture(page, flow.id, "canvas-hub-installed");
}

async function runConversation(page, flow) {
  await registerTrajectory(flow);
  await waitForTestId(page, "conversation-panel-new-thread-picker", 60_000);
  await page.getByTestId("conversation-panel-new-thread-picker").click();
  await waitForTestId(page, "launch-no-workspace", 30_000);
  await capture(page, flow.id, "new-chat-menu");
  const conversationResponsePromise = page.waitForResponse((response) => {
    return (
      response.url().startsWith(`${BACKEND_URL}/api/conversations`) &&
      response.request().method() === "POST" &&
      response.status() >= 200 &&
      response.status() < 300
    );
  });
  await page.getByTestId("launch-no-workspace").click({ noWaitAfter: true });
  const conversationResponse = await conversationResponsePromise;
  const conversation = await conversationResponse.json();
  const conversationShortId = String(conversation.id).slice(0, 5);
  await waitForBodyText(page, `Conversation ${conversationShortId}`, 60_000);
  await page.keyboard.press("Escape");
  const createdConversationCard = page
    .getByTestId("conversation-card")
    .filter({ hasText: `Conversation ${conversationShortId}` })
    .first();
  await createdConversationCard.waitFor({ state: "visible", timeout: 30_000 });
  await capture(page, flow.id, "conversation-card-created");
  await createdConversationCard.dispatchEvent("click");
  try {
    await page.waitForURL(/\/conversations\/.+/, { timeout: 10_000 });
  } catch {
    await gotoPage(page, `${FRONTEND_URL}/conversations/${conversation.id}`);
  }
  await waitForTestId(page, "chat-input", 180_000);
  await capture(page, flow.id, "conversation-ready");
  await setChatInput(page, flow.prompt);
  await capture(page, flow.id, "prompt");
  await page.getByTestId("submit-button").click({ noWaitAfter: true });
  await capture(page, flow.id, "conversation-started");
  await waitForOutputText(page, flow.successToken, 90_000);
  await capture(page, flow.id, "tool-observation");
  await waitForOutputText(page, flow.finalText, 90_000);
  await capture(page, flow.id, "final-reply");
}

async function main() {
  fs.mkdirSync(PR_DIR, { recursive: true });
  const selectedIds = new Set(
    (process.env.FLOW_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const selectedFlows =
    selectedIds.size === 0
      ? flows
      : flows.filter((flow) => selectedIds.has(flow.id));
  if (selectedFlows.length === 0) {
    throw new Error(`No matching flows for FLOW_IDS=${process.env.FLOW_IDS}`);
  }

  const { browser, page } = await setupPage();
  try {
    await ensureLlmSettings();
    await cleanupStaleHubMcpServers();
    const hubAgentKey = await getHubAgentKey();
    for (const flow of selectedFlows) {
      fs.rmSync(frameDir(flow.id), { recursive: true, force: true });
      console.log(`Capturing ${flow.title}`);
      if (flow.hubMode === "custom") {
        await addCustomHubIntegration(page, flow);
      } else {
        await addManagedOauthIntegration(page, flow);
      }
      await showAgentConnection(page, flow);
      await installHubMcpInCanvas(page, flow, hubAgentKey);
      await runConversation(page, flow);
      const gif = makeGif(flow.id);
      console.log(`Wrote ${path.relative(ROOT, gif)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
