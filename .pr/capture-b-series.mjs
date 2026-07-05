import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://127.0.0.1:3101";
const LOCAL_BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:18110";
const LOCAL_SESSION_API_KEY =
  process.env.SESSION_API_KEY ?? "codex-mcp-gif-isolated-key";
const CLOUD_BACKEND_URL =
  process.env.CLOUD_BACKEND_URL ?? "https://app.all-hands.dev";
const ALLOW_PERSONAL_CLOUD_SETTINGS_MUTATION =
  process.env.ALLOW_PERSONAL_CLOUD_SETTINGS_MUTATION === "1";
const FIXTURE_PUBLIC_URL =
  process.env.FIXTURE_PUBLIC_URL ?? "https://statusquo-dr-ohmcp.ngrok-free.app";
const MOCK_LLM_ADMIN_URL = process.env.MOCK_LLM_URL ?? "http://127.0.0.1:19999";
const MOCK_LLM_BASE_URL =
  process.env.MOCK_LLM_BASE_URL ?? `${FIXTURE_PUBLIC_URL}/mock-llm`;
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
const LLM_ENV_FILE =
  process.env.LLM_ENV_FILE ??
  (process.env.HOME ? path.join(process.env.HOME, ".env") : "");

function readDotEnv(file) {
  if (!file || !fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.replace(/^export\s+/, ""))
      .map((line) => {
        const eq = line.indexOf("=");
        if (eq === -1) return null;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
      .filter(Boolean),
  );
}

const envFileValues = readDotEnv(LLM_ENV_FILE);
function configuredEnv(name) {
  return process.env[name] ?? envFileValues[name];
}

const CONFIGURED_LLM_MODEL = configuredEnv("LLM_MODEL");
const CONFIGURED_LLM_API_KEY = configuredEnv("LLM_API_KEY");
const CONFIGURED_LLM_BASE_URL = configuredEnv("LLM_BASE_URL");
const USE_CONFIGURED_LLM = Boolean(
  CONFIGURED_LLM_MODEL || CONFIGURED_LLM_API_KEY || CONFIGURED_LLM_BASE_URL,
);
if (USE_CONFIGURED_LLM && (!CONFIGURED_LLM_MODEL || !CONFIGURED_LLM_API_KEY)) {
  throw new Error("Configured LLM requires LLM_MODEL and LLM_API_KEY.");
}
const CAPTURE_LLM_MODEL = CONFIGURED_LLM_MODEL ?? MOCK_MODEL;
const CAPTURE_LLM_API_KEY = CONFIGURED_LLM_API_KEY ?? MOCK_LLM_API_KEY;
const CAPTURE_LLM_BASE_URL = CONFIGURED_LLM_BASE_URL ?? MOCK_LLM_BASE_URL;

const flows = [
  {
    id: "b1",
    title: "b1: Cloud backend + unauthenticated weather MCP",
    serverName: "b1_weather",
    url: `${FIXTURE_PUBLIC_URL}/weather/mcp`,
    auth: { mode: "None" },
    toolName: "weather_forecast",
    toolArgs: { city: "Pittsburgh" },
    prompt: "Use the weather MCP to get the Pittsburgh forecast.",
    finalText: "B1 cloud weather MCP complete.",
    successToken: "weather_fixture_success",
  },
  {
    id: "b2",
    title: "b2: Cloud backend + bearer-token MCP",
    serverName: "b2_elevenlabs",
    url: `${FIXTURE_PUBLIC_URL}/elevenlabs/mcp`,
    auth: { mode: "Bearer token", token: "elevenlabs-test-token" },
    toolName: "elevenlabs_voice_note",
    toolArgs: { text: "Canvas demo voice note" },
    prompt: "Use the elevenlabs MCP to draft a voice note.",
    finalText: "B2 cloud bearer-token MCP complete.",
    successToken: "elevenlabs_fixture_success",
  },
  {
    id: "b3",
    title: "b3: Cloud backend + header-authenticated MCP",
    serverName: "b3_datadog",
    url: `${FIXTURE_PUBLIC_URL}/datadog/mcp`,
    auth: {
      mode: "Header",
      headers: "DD-API-KEY=datadog-api-key\nDD-APPLICATION-KEY=datadog-app-key",
    },
    toolName: "datadog_metric_snapshot",
    toolArgs: { service: "canvas-api" },
    prompt: "Use the datadog MCP to inspect canvas-api metrics.",
    finalText: "B3 cloud header-auth MCP complete.",
    successToken: "datadog_fixture_success",
  },
  {
    id: "b4",
    title: "b4: Cloud backend + OAuth client-id/secret MCP",
    serverName: "b4_notion",
    url: `${FIXTURE_PUBLIC_URL}/notion/mcp`,
    auth: {
      mode: "OAuth",
      clientAuthMethod: "Client secret POST",
      clientId: "notion-client",
      clientSecret: "notion-secret",
      scopes: "read:mock",
    },
    toolName: "notion_page_lookup",
    toolArgs: { title: "Roadmap" },
    prompt: "Use the notion MCP to look up the Roadmap page.",
    finalText: "B4 cloud OAuth client-secret MCP complete.",
    successToken: "notion_fixture_success",
  },
  {
    id: "b5",
    title: "b5: Cloud backend + dynamic OAuth MCP",
    serverName: "b5_linear",
    url: `${FIXTURE_PUBLIC_URL}/linear/mcp`,
    auth: { mode: "OAuth", scopes: "read:mock write:mock" },
    toolName: "linear_issue_summary",
    toolArgs: { issue_key: "LIN-42" },
    prompt: "Use the linear MCP to summarize issue LIN-42.",
    finalText: "B5 cloud dynamic OAuth MCP complete.",
    successToken: "linear_fixture_success",
  },
];

function readCloudApiKey() {
  if (process.env.OPENHANDS_CLOUD_API_KEY)
    return process.env.OPENHANDS_CLOUD_API_KEY;
  if (process.env.OPENHANDS_API_KEY) return process.env.OPENHANDS_API_KEY;
  const tokenFile = "/tmp/openhands-cloud-token.json";
  if (fs.existsSync(tokenFile)) {
    const token = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
    return token.access_token ?? token.api_key ?? token.token;
  }
  throw new Error(
    "Missing cloud token. Set OPENHANDS_CLOUD_API_KEY or authorize device flow first.",
  );
}

const CLOUD_API_KEY = readCloudApiKey();

function serverNameForFlow(flow) {
  return `${flow.serverName}_${RUN_TAG}`;
}

function modelToolNameForFlow(flow) {
  return `${serverNameForFlow(flow)}_${flow.toolName}`;
}

function conversationPrompt(flow) {
  if (!USE_CONFIGURED_LLM) return flow.prompt;
  return [
    `Call the MCP tool named ${modelToolNameForFlow(flow)} with these JSON arguments: ${JSON.stringify(flow.toolArgs)}.`,
    "Do not answer from memory. Wait for the MCP tool observation.",
    `After the tool observation, reply with exactly this full line: ${flow.finalText} The MCP observation contains ${flow.successToken}.`,
  ].join(" ");
}

async function adminPost(pathname, body = undefined) {
  const response = await fetch(`${MOCK_LLM_ADMIN_URL}${pathname}`, {
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
  if (USE_CONFIGURED_LLM) return;
  await adminPost("/admin/reset");
  await adminPost("/admin/trajectory/register", {
    name: flow.id,
    turns: [
      { text: flow.title },
      {
        tool_call: {
          name: modelToolNameForFlow(flow),
          arguments: flow.toolArgs,
        },
      },
      {
        text: `${flow.finalText} The MCP observation contains ${flow.successToken}.`,
      },
    ],
  });
  await adminPost("/admin/trajectory/activate", { name: flow.id });
}

async function cloudApi(pathname, options = {}) {
  const response = await fetch(`${CLOUD_BACKEND_URL}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CLOUD_API_KEY}`,
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
      `Cloud ${pathname} failed: ${response.status} ${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`,
    );
  }
  return payload;
}

async function ensureCloudSettings() {
  const cloudUrl = new URL(CLOUD_BACKEND_URL);
  if (
    cloudUrl.hostname === "app.all-hands.dev" &&
    !ALLOW_PERSONAL_CLOUD_SETTINGS_MUTATION
  ) {
    throw new Error(
      "Refusing to mutate personal OpenHands Cloud settings. Use a feature deploy/dedicated Cloud backend, or set ALLOW_PERSONAL_CLOUD_SETTINGS_MUTATION=1 for this capture run.",
    );
  }
  await cloudApi("/api/v1/settings", {
    method: "POST",
    body: JSON.stringify({
      agent_settings_diff: {
        agent_kind: "openhands",
        agent: "CodeActAgent",
        llm: {
          model: CAPTURE_LLM_MODEL,
          api_key: CAPTURE_LLM_API_KEY,
          base_url: CAPTURE_LLM_BASE_URL,
        },
      },
      conversation_settings_diff: {
        max_iterations: 50,
      },
    }),
  });
}

async function cleanupCloudMcpServers() {
  const settings = await cloudApi("/api/v1/settings", { method: "GET" });
  const currentConfig =
    settings.agent_settings?.mcp_config ?? settings.mcp_config ?? {};
  if (!currentConfig || typeof currentConfig !== "object") return;
  const hasMcpServersWrapper =
    currentConfig.mcpServers &&
    typeof currentConfig.mcpServers === "object" &&
    !Array.isArray(currentConfig.mcpServers);
  const currentServers = hasMcpServersWrapper
    ? currentConfig.mcpServers
    : currentConfig;
  const flowPrefixes = flows.map((flow) => `${flow.serverName}_`);
  const filtered = Object.fromEntries(
    Object.entries(currentServers).filter(
      ([name]) =>
        !name.endsWith(`_${RUN_TAG}`) &&
        !flowPrefixes.some((prefix) => name.startsWith(prefix)),
    ),
  );
  if (Object.keys(filtered).length === Object.keys(currentServers).length)
    return;
  const nextConfig = hasMcpServersWrapper ? { mcpServers: filtered } : filtered;
  await cloudApi("/api/v1/settings", {
    method: "POST",
    body: JSON.stringify({
      agent_settings_diff: {
        mcp_config: Object.keys(filtered).length > 0 ? nextConfig : null,
      },
    }),
  });
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
    baseURL: FRONTEND_URL,
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ({ localApiKey, localBackendUrl, cloudApiKey, cloudBackendUrl }) => {
      window.localStorage.setItem("analytics-consent", "false");
      window.localStorage.setItem("openhands-telemetry-consent", "denied");
      window.localStorage.setItem("openhands-telemetry-first-use", "true");
      window.localStorage.setItem("openhands-onboarded", "1");

      const active = { backendId: "cloud-openhands", orgId: null };
      window.localStorage.setItem(
        "openhands-backends",
        JSON.stringify([
          {
            id: "default-local",
            name: "Local OAuth helper",
            host: localBackendUrl,
            apiKey: localApiKey,
            kind: "local",
          },
          {
            id: "cloud-openhands",
            name: "OpenHands Cloud",
            host: cloudBackendUrl,
            apiKey: cloudApiKey,
            kind: "cloud",
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

      window.open = (url) => {
        const mount = () => {
          const frame = document.createElement("iframe");
          frame.setAttribute("data-testid", "mcp-oauth-hidden-popup");
          frame.style.position = "fixed";
          frame.style.width = "1px";
          frame.style.height = "1px";
          frame.style.opacity = "0";
          frame.style.pointerEvents = "none";
          frame.style.left = "-10px";
          frame.style.bottom = "-10px";
          document.body.appendChild(frame);
          if (url && url !== "about:blank") frame.src = String(url);
          return frame;
        };
        let frame = document.body ? mount() : null;
        const ensureFrame = () => {
          if (!frame) frame = mount();
          return frame;
        };
        return {
          closed: false,
          close() {
            this.closed = true;
            frame?.remove();
          },
          get location() {
            return ensureFrame().contentWindow?.location;
          },
          set location(value) {
            ensureFrame().src = String(value);
          },
          focus() {},
        };
      };
    },
    {
      localApiKey: LOCAL_SESSION_API_KEY,
      localBackendUrl: LOCAL_BACKEND_URL,
      cloudApiKey: CLOUD_API_KEY,
      cloudBackendUrl: CLOUD_BACKEND_URL,
    },
  );
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isLocalBackend =
      url.origin === new URL(LOCAL_BACKEND_URL).origin ||
      (url.origin === FRONTEND_URL && url.pathname.startsWith("/api/"));
    if (!isLocalBackend) {
      await route.continue();
      return;
    }
    await route.continue({
      headers: {
        ...request.headers(),
        "X-Session-API-Key": LOCAL_SESSION_API_KEY,
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

async function gotoPage(page, pathname) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(pathname, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
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

function currentConversationId(page) {
  try {
    const pathname = new URL(page.url()).pathname;
    const match = pathname.match(/^\/conversations\/([^/]+)/);
    if (!match || match[1].startsWith("task-")) return null;
    return match[1];
  } catch {
    return null;
  }
}

async function cloudEventHistoryContains(conversationId, text) {
  if (!conversationId) return false;
  const params = new URLSearchParams({
    limit: "100",
    sort_order: "TIMESTAMP",
  });
  const page = await cloudApi(
    `/api/v1/conversation/${conversationId}/events/search?${params.toString()}`,
    { method: "GET" },
  );
  return JSON.stringify(page?.items ?? []).includes(text);
}

async function waitForOutputText(page, text, timeout = 180_000) {
  const started = Date.now();
  let lastCloudCheck = 0;
  while (Date.now() - started < timeout) {
    try {
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
    } catch {}
    if (Date.now() - lastCloudCheck > 2_000) {
      lastCloudCheck = Date.now();
      try {
        if (
          await cloudEventHistoryContains(currentConversationId(page), text)
        ) {
          return;
        }
      } catch {}
    }
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

async function installMcpServer(page, flow) {
  const flowUrl =
    flow.auth.mode === "OAuth"
      ? flow.url
      : `${flow.url}?run=${RUN_TAG}-${flow.id}`;
  const flowName = serverNameForFlow(flow);

  await gotoPage(page, "/mcp");
  await dismissBlockingModals(page);
  await waitForTestId(page, "mcp-page", 60_000);
  await capture(page, flow.id, "mcp-page");

  await page.getByTestId("mcp-add-custom-server").click();
  await waitForTestId(page, "mcp-custom-editor");
  await capture(page, flow.id, "custom-modal");

  await selectDropdownOption(page, /Server Type/i, /^SHTTP$/i);
  await page.getByTestId("server-name-input").fill(flowName);
  await page.getByTestId("url-input").fill(flowUrl);
  await capture(page, flow.id, "server-url");

  if (flow.auth.mode !== "None") {
    await selectDropdownOption(page, /Authentication/i, flow.auth.mode);
  }
  if (flow.auth.mode === "Bearer token") {
    await page.getByTestId("api-key-input").fill(flow.auth.token);
  }
  if (flow.auth.mode === "Header") {
    await page.getByTestId("headers-input").fill(flow.auth.headers);
  }
  if (flow.auth.mode === "OAuth") {
    if (flow.auth.clientAuthMethod) {
      await selectDropdownOption(
        page,
        /OAuth client auth/i,
        flow.auth.clientAuthMethod,
      );
    }
    if (flow.auth.clientId) {
      await page.getByTestId("oauth-client-id-input").fill(flow.auth.clientId);
    }
    if (flow.auth.clientSecret) {
      await page
        .getByTestId("oauth-client-secret-input")
        .fill(flow.auth.clientSecret);
    }
    if (flow.auth.scopes) {
      await page.getByTestId("oauth-scopes-input").fill(flow.auth.scopes);
    }
  }
  await capture(page, flow.id, "auth-filled");

  await page.getByTestId("submit-button").click();
  if (flow.auth.mode === "OAuth") {
    await page.waitForTimeout(3_000);
    await capture(page, flow.id, "oauth-submitted");
  }

  try {
    await page.getByTestId("mcp-custom-editor").waitFor({
      state: "hidden",
      timeout: flow.auth.mode === "OAuth" ? 90_000 : 45_000,
    });
  } catch (error) {
    await capture(page, flow.id, "install-still-open").catch(() => {});
    const modalText = await page
      .getByTestId("mcp-custom-editor")
      .innerText()
      .catch(() => "");
    throw new Error(
      `MCP install modal did not close for ${flow.id}. Text:\n${modalText}`,
      { cause: error },
    );
  }
  await waitForTestId(page, "mcp-installed-list");
  await capture(page, flow.id, "installed");
}

async function runConversation(page, flow) {
  await registerTrajectory(flow);
  await gotoPage(page, "/");
  await dismissBlockingModals(page);
  await waitForTestId(page, "home-chat-launcher", 60_000);
  await capture(page, flow.id, "home");
  await setChatInput(page, conversationPrompt(flow));
  await capture(page, flow.id, "prompt");
  await page.getByTestId("submit-button").click();
  await page.waitForURL(/\/conversations\/.+/, { timeout: 45_000 });
  await capture(page, flow.id, "conversation-provisioning");
  await page.waitForFunction(
    () => /^\/conversations\/(?!task-).+/.test(window.location.pathname),
    undefined,
    { timeout: 180_000 },
  );
  await waitForTestId(page, "chat-input", 180_000);
  await capture(page, flow.id, "conversation-started");
  await waitForOutputText(page, flow.successToken, 240_000);
  await capture(page, flow.id, "tool-observation");
  await waitForOutputText(page, flow.finalText, 120_000);
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

  await ensureCloudSettings();
  await cleanupCloudMcpServers();

  const { browser, page } = await setupPage();
  try {
    for (const flow of selectedFlows) {
      fs.rmSync(frameDir(flow.id), { recursive: true, force: true });
      console.log(`Capturing ${flow.title}`);
      await installMcpServer(page, flow);
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
