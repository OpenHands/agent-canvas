/**
 * Live e2e through the APPLICATION's own conversation-start path (not the
 * isolated request builder). Drives the same functions the running app calls:
 *
 *   onboarding "Set up credentials"  -> SecretsService.createSecret(name, value)
 *   choose-agent step                -> buildAcpAgentSettingsDiff(...) PATCH /api/settings
 *   conversation start               -> buildStartConversationRequestWithEncryptedSettings(...)
 *                                         (reads settings + the saved secret NAMES,
 *                                          emits each as a LookupSecret the
 *                                          agent-server resolves from its store)
 *
 * This is the piece the request-builder script can't cover: it proves the saved
 * credentials round-trip through the backend store and the orchestrator emits
 * the right LookupSecrets, end-to-end, against a real container.
 *
 * Requires an agent-server with software-agent-sdk#3510 (first in v1.25.0) —
 * ACP credentials resolve off the event loop; an older image deadlocks.
 *
 *   npx vite-node -c tests/e2e/live-acp/vite-node.config.mts \
 *     tests/e2e/live-acp/acp-docker-app-e2e.mts -- codex
 *
 * One provider per process (settings are global on the backend; a fresh process
 * avoids the SettingsService cache bleeding between providers).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { SecretsService } from "#/api/secrets-service";
import { buildStartConversationRequestWithEncryptedSettings } from "#/api/agent-server-adapter";
import { buildAcpAgentSettingsDiff } from "#/constants/acp-providers";
import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";

const BASE = process.env.ACP_E2E_BASE_URL ?? "http://localhost:8010";
const POLL_TIMEOUT_MS = Number(process.env.ACP_E2E_TIMEOUT_MS ?? 180_000);

// Point the app's backend registry at the container, exactly as if the user had
// added it in the backend selector. Everything downstream (SecretsService,
// SettingsService, the orchestrator) resolves the host through this.
setRegisteredBackends([
  {
    id: "acp-docker",
    name: "ACP Docker",
    host: BASE,
    apiKey: "",
    kind: "local",
  },
]);
setActiveSelection({ backendId: "acp-docker", orgId: null });

interface ProviderPlan {
  id: string;
  acpServer: string;
  model: string;
  expectedToken: string;
  sessionMode?: string;
  collectSecrets: () => Record<string, string> | null;
}

function readFileTrimmed(file: string): string | null {
  try {
    const v = readFileSync(file, "utf-8");
    return v.trim().length > 0 ? v : null;
  } catch {
    return null;
  }
}

function claudeOAuthToken(): string | null {
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf-8" },
    );
    const t = JSON.parse(raw)?.claudeAiOauth?.accessToken;
    return typeof t === "string" && t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

function gcloudProject(): string | null {
  try {
    return (
      execFileSync("gcloud", ["config", "get-value", "project"], {
        encoding: "utf-8",
      }).trim() || null
    );
  } catch {
    return null;
  }
}

const PLANS: Record<string, ProviderPlan> = {
  codex: {
    id: "codex",
    acpServer: "codex",
    model: process.env.ACP_E2E_CODEX_MODEL ?? "gpt-5.5/medium",
    expectedToken: "ACPOK-CODEX",
    collectSecrets: () => {
      const auth = readFileTrimmed(path.join(homedir(), ".codex", "auth.json"));
      return auth ? { CODEX_AUTH_JSON: auth } : null;
    },
  },
  claude: {
    id: "claude",
    acpServer: "claude-code",
    model: process.env.ACP_E2E_CLAUDE_MODEL ?? "claude-opus-4-7",
    expectedToken: "ACPOK-CLAUDE",
    collectSecrets: () => {
      const t = claudeOAuthToken();
      return t ? { CLAUDE_CODE_OAUTH_TOKEN: t } : null;
    },
  },
  gemini: {
    id: "gemini",
    acpServer: "gemini-cli",
    model: process.env.ACP_E2E_GEMINI_MODEL ?? "gemini-2.5-flash",
    expectedToken: "ACPOK-GEMINI",
    sessionMode: process.env.ACP_E2E_GEMINI_SESSION_MODE,
    collectSecrets: () => {
      const adc = readFileTrimmed(
        path.join(
          homedir(),
          ".config",
          "gcloud",
          "application_default_credentials.json",
        ),
      );
      const project = process.env.GOOGLE_CLOUD_PROJECT ?? gcloudProject();
      if (!adc || !project) return null;
      return {
        GOOGLE_APPLICATION_CREDENTIALS_JSON: adc,
        GOOGLE_CLOUD_PROJECT: project,
        GOOGLE_CLOUD_LOCATION:
          process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
        GOOGLE_GENAI_USE_VERTEXAI: "true",
      };
    },
  },
};

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`POST ${url} -> ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok)
    throw new Error(`GET ${url} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

// Terminal states for a single-turn run. NB: "idle" is deliberately NOT here —
// a freshly-created conversation reports "idle" before the agent starts, so
// treating it as terminal bails out before the reply exists. Wait for the run
// to actually finish (or error/stuck).
const TERMINAL = new Set(["finished", "error", "stuck", "stopped"]);

async function run(plan: ProviderPlan): Promise<boolean> {
  const secrets = plan.collectSecrets();
  if (!secrets) {
    console.log(`⏭️  ${plan.id}: SKIP — credentials not present on host`);
    return true;
  }

  const settingsClient = new SettingsClient(getAgentServerClientOptions());

  // 1) onboarding "Set up credentials" — save each reserved cred as a global
  //    secret via the SAME service call the SetupAcpSecretsStep makes.
  console.log(
    `▶️  ${plan.id}: saving reserved creds via SecretsService.createSecret [${Object.keys(
      secrets,
    ).join(", ")}]`,
  );
  for (const [name, value] of Object.entries(secrets)) {
    await SecretsService.createSecret(name, value);
  }

  // 2) choose-agent step — persist ACP agent settings via the app's diff builder.
  const diff = buildAcpAgentSettingsDiff(plan.acpServer, { model: plan.model });
  if (!diff) throw new Error(`no settings diff for ${plan.acpServer}`);
  if (plan.sessionMode) diff.acp_session_mode = plan.sessionMode;
  await settingsClient.updateSettings({ agent_settings_diff: diff });
  console.log(
    `   PATCHed agent settings: ${JSON.stringify({
      acp_server: diff.acp_server,
      acp_model: diff.acp_model,
      ...(plan.sessionMode ? { acp_session_mode: plan.sessionMode } : {}),
    })}`,
  );

  // 3) conversation start — the app's own orchestrator. It re-reads settings +
  //    the saved secret names and emits each as a LookupSecret.
  const workingDir = `/workspace/app-e2e/${plan.id}-${Date.now()}`;
  const payload = (await buildStartConversationRequestWithEncryptedSettings({
    settings: undefined as any, // base settings come from the backend fetch
    query: `Reply with exactly: ${plan.expectedToken}`,
    workingDir,
  })) as any;

  const emitted = payload.secrets ?? {};
  console.log(
    `   orchestrator emitted secrets: ${Object.entries(emitted)
      .map(([k, v]: any) => `${k}=${v.kind}`)
      .join(", ")}`,
  );
  // Assert the orchestrator emitted a LookupSecret for each saved credential.
  const missing = Object.keys(secrets).filter(
    (n) => emitted[n]?.kind !== "LookupSecret",
  );
  if (missing.length > 0) {
    console.log(
      `   ❌ ${plan.id}: orchestrator did NOT emit a LookupSecret for: ${missing.join(", ")}`,
    );
    return false;
  }

  const created = await postJson(`${BASE}/api/conversations`, payload);
  const id = created.id;
  console.log(`   conversation ${id} created; polling…`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let status = "";
  while (Date.now() < deadline) {
    const info = await getJson(`${BASE}/api/conversations/${id}`);
    status = String(info.execution_status ?? "").toLowerCase();
    if (TERMINAL.has(status)) break;
    await new Promise((r) => setTimeout(r, 2500));
  }
  const final = await getJson(
    `${BASE}/api/conversations/${id}/agent_final_response`,
  );
  const reply =
    typeof final === "string"
      ? final
      : (final?.response ?? final?.content ?? JSON.stringify(final));
  const ok = String(reply).includes(plan.expectedToken);
  console.log(
    `   status=${status} reply=${JSON.stringify(String(reply).slice(0, 160))}`,
  );
  console.log(`   ${ok ? "✅ PASS" : "❌ FAIL"} (expected "${plan.expectedToken}")`);
  return ok;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const id = args[0];
  const plan = id ? PLANS[id] : undefined;
  if (!plan) {
    console.error(`usage: ... acp-docker-app-e2e.mts -- <codex|claude|gemini>`);
    process.exit(2);
  }
  console.log(`App-path e2e against ${BASE} — provider: ${plan.id}`);
  const ok = await run(plan).catch((e) => {
    console.error(`   ❌ ${plan.id} errored: ${(e as Error).message}`);
    return false;
  });
  console.log(ok ? "\nPASS" : "\nFAIL");
  process.exit(ok ? 0 : 1);
}

main();
