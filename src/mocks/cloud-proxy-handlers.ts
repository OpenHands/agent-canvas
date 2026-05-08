import { http, HttpResponse } from "msw";
import type {
  V1AppConversation,
  V1AppConversationStartTask,
} from "#/api/conversation-service/v1-conversation-service.types";
import type { DirectConversationInfo } from "#/api/agent-server-adapter";
import type { SettingsValue } from "#/types/settings";
import {
  MOCK_AGENT_SETTINGS_SCHEMA,
  MOCK_CONVERSATION_SETTINGS_SCHEMA,
} from "./settings-handlers";

interface CloudProxyEnvelope {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
}

const CLOUD_USER_ID = "user-1";
const CLOUD_ORG_ID = CLOUD_USER_ID;
const CLOUD_RUNTIME_URL = "https://runtime.mock.all-hands.dev";
const IDLE_EXECUTION_STATUS = "idle" as NonNullable<
  V1AppConversation["execution_status"]
>;

let currentOrgId = CLOUD_ORG_ID;
let nextCloudConversationId = 2;

const now = new Date().toISOString();

type CloudSettings = {
  llm_model: string;
  llm_base_url: string;
  llm_api_key: string | null;
  llm_api_key_set: boolean;
  search_api_key_set: boolean;
  agent: string;
  confirmation_mode: boolean;
  security_analyzer: string;
  enable_default_condenser: boolean;
  condenser_max_size: number;
  enable_sound_notifications: boolean;
  language: string;
  email: string;
  email_verified: boolean;
  user_consents_to_analytics: boolean;
  provider_tokens_set: { github: string };
  agent_settings: Record<string, SettingsValue>;
  conversation_settings: Record<string, SettingsValue>;
  disabled_skills: string[];
};

let cloudSettings: CloudSettings = {
  llm_model: "openhands/claude-sonnet-4-5-20250929",
  llm_base_url: "https://llm-proxy.app.all-hands.dev",
  llm_api_key: null,
  llm_api_key_set: true,
  search_api_key_set: true,
  agent: "CodeActAgent",
  confirmation_mode: false,
  security_analyzer: "llm",
  enable_default_condenser: true,
  condenser_max_size: 240,
  enable_sound_notifications: false,
  language: "en",
  email: "demo@example.com",
  email_verified: true,
  user_consents_to_analytics: false,
  provider_tokens_set: { github: "github" },
  agent_settings: {
    llm: {
      model: "openhands/claude-sonnet-4-5-20250929",
      base_url: "https://llm-proxy.app.all-hands.dev",
    },
    condenser: {
      enabled: true,
      max_size: 240,
    },
    agent: "CodeActAgent",
  },
  conversation_settings: {
    confirmation_mode: false,
    security_analyzer: "llm",
    max_iterations: 500,
  },
  disabled_skills: [],
};

const cloudConversations = new Map<string, V1AppConversation>([
  [
    "cloud-conversation-1",
    {
      id: "cloud-conversation-1",
      created_by_user_id: CLOUD_USER_ID,
      selected_repository: "OpenHands/agent-canvas",
      selected_branch: "main",
      git_provider: "github",
      title: "Cloud Demo Conversation",
      trigger: null,
      pr_number: [],
      llm_model: cloudSettings.llm_model,
      metrics: null,
      created_at: now,
      updated_at: now,
      execution_status: IDLE_EXECUTION_STATUS,
      conversation_url: `${CLOUD_RUNTIME_URL}/api/conversations/cloud-conversation-1`,
      session_api_key: "cloud-session-key",
      sandbox_id: "sandbox-cloud-1",
      workspace: { working_dir: "/workspace/project" },
      public: false,
      sub_conversation_ids: [],
    },
  ],
]);

const cloudStartTasks = new Map<string, V1AppConversationStartTask>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] != null &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function syncFlatSettingsFromNested() {
  const llm = cloudSettings.agent_settings.llm as
    | Record<string, SettingsValue>
    | undefined;
  const condenser = cloudSettings.agent_settings.condenser as
    | Record<string, SettingsValue>
    | undefined;

  if (typeof llm?.model === "string") cloudSettings.llm_model = llm.model;
  if (typeof llm?.base_url === "string") {
    cloudSettings.llm_base_url = llm.base_url;
  }
  if (typeof condenser?.enabled === "boolean") {
    cloudSettings.enable_default_condenser = condenser.enabled;
  }
  if (typeof condenser?.max_size === "number") {
    cloudSettings.condenser_max_size = condenser.max_size;
  }
}

function toRuntimeConversation(
  conversation: V1AppConversation,
): DirectConversationInfo {
  return {
    id: conversation.id,
    title: conversation.title,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    execution_status: conversation.execution_status,
    metrics: conversation.metrics,
    agent: {
      llm: {
        model: conversation.llm_model,
      },
    },
    workspace: conversation.workspace ?? null,
  };
}

function createCloudConversation(body: unknown): V1AppConversationStartTask {
  const request =
    body && typeof body === "object"
      ? (body as V1AppConversationStartTask["request"])
      : {};
  const id = `cloud-conversation-${nextCloudConversationId}`;
  nextCloudConversationId += 1;

  const conversation: V1AppConversation = {
    id,
    created_by_user_id: CLOUD_USER_ID,
    selected_repository: request.selected_repository ?? null,
    selected_branch: request.selected_branch ?? null,
    git_provider: request.git_provider ?? null,
    title: request.title ?? "Cloud New Conversation",
    trigger: request.trigger ?? null,
    pr_number: request.pr_number ?? [],
    llm_model: cloudSettings.llm_model,
    metrics: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    execution_status: IDLE_EXECUTION_STATUS,
    conversation_url: `${CLOUD_RUNTIME_URL}/api/conversations/${id}`,
    session_api_key: "cloud-session-key",
    sandbox_id: `sandbox-${id}`,
    workspace: { working_dir: "/workspace/project" },
    public: false,
    sub_conversation_ids: [],
  };
  cloudConversations.set(id, conversation);

  const task: V1AppConversationStartTask = {
    id: `task-${id}`,
    created_by_user_id: CLOUD_USER_ID,
    status: "READY",
    detail: null,
    app_conversation_id: id,
    agent_server_url: conversation.conversation_url,
    request,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
  };
  cloudStartTasks.set(task.id, task);
  return task;
}

function handleCloudRequest(envelope: CloudProxyEnvelope) {
  const upstream = new URL(envelope.path, "https://cloud.mock");
  const { pathname, searchParams } = upstream;
  const { method } = envelope;

  if (method === "GET" && pathname === "/api/organizations") {
    return {
      items: [{ id: CLOUD_ORG_ID, name: "Xingyao Wang" }],
      current_org_id: currentOrgId,
    };
  }

  if (method === "GET" && pathname === "/api/keys/current") {
    return { org_id: CLOUD_ORG_ID };
  }

  if (
    method === "GET" &&
    pathname === `/api/organizations/${CLOUD_ORG_ID}/me`
  ) {
    return { org_id: CLOUD_ORG_ID, user_id: CLOUD_USER_ID };
  }

  if (
    method === "POST" &&
    pathname === `/api/organizations/${CLOUD_ORG_ID}/switch`
  ) {
    currentOrgId = CLOUD_ORG_ID;
    return { ok: true };
  }

  if (method === "GET" && pathname === "/api/v1/settings") {
    return clone(cloudSettings);
  }

  if (method === "POST" && pathname === "/api/v1/settings") {
    const body =
      envelope.body && typeof envelope.body === "object"
        ? (envelope.body as Record<string, unknown>)
        : {};
    if (body.agent_settings_diff) {
      cloudSettings.agent_settings = deepMerge(
        cloudSettings.agent_settings as Record<string, unknown>,
        body.agent_settings_diff as Record<string, unknown>,
      ) as Record<string, SettingsValue>;
    }
    if (body.conversation_settings_diff) {
      cloudSettings.conversation_settings = deepMerge(
        cloudSettings.conversation_settings as Record<string, unknown>,
        body.conversation_settings_diff as Record<string, unknown>,
      ) as Record<string, SettingsValue>;
    }
    if (Array.isArray(body.disabled_skills)) {
      cloudSettings.disabled_skills = body.disabled_skills as string[];
    }
    syncFlatSettingsFromNested();
    return { ok: true };
  }

  if (method === "GET" && pathname === "/api/v1/settings/agent-schema") {
    return MOCK_AGENT_SETTINGS_SCHEMA;
  }

  if (method === "GET" && pathname === "/api/v1/settings/conversation-schema") {
    return MOCK_CONVERSATION_SETTINGS_SCHEMA;
  }

  if (method === "GET" && pathname === "/api/v1/app-conversations/search") {
    const limit = Number(searchParams.get("limit") ?? "20");
    return {
      items: Array.from(cloudConversations.values()).slice(0, limit),
      next_page_id: null,
    };
  }

  if (method === "GET" && pathname === "/api/v1/app-conversations") {
    const ids = searchParams.getAll("ids");
    return ids.map((id) => cloudConversations.get(id) ?? null);
  }

  if (method === "POST" && pathname === "/api/v1/app-conversations") {
    return createCloudConversation(envelope.body);
  }

  if (
    method === "GET" &&
    pathname === "/api/v1/app-conversations/start-tasks"
  ) {
    const ids = searchParams.getAll("ids");
    return ids.map((id) => cloudStartTasks.get(id) ?? null);
  }

  const appConversationMatch = pathname.match(
    /^\/api\/v1\/app-conversations\/([^/]+)$/,
  );
  if (appConversationMatch) {
    const id = decodeURIComponent(appConversationMatch[1]);
    if (method === "DELETE") {
      cloudConversations.delete(id);
      return { success: true };
    }
    if (method === "PATCH") {
      const current = cloudConversations.get(id);
      if (!current) {
        return new HttpResponse(JSON.stringify({ detail: "Not found" }), {
          status: 404,
        });
      }
      const patch =
        envelope.body && typeof envelope.body === "object"
          ? (envelope.body as Partial<V1AppConversation>)
          : {};
      const next = {
        ...current,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      cloudConversations.set(id, next);
      return next;
    }
  }

  const runtimeConversationMatch = pathname.match(
    /^\/api\/conversations\/([^/]+)$/,
  );
  if (method === "GET" && runtimeConversationMatch) {
    const id = decodeURIComponent(runtimeConversationMatch[1]);
    const conversation = cloudConversations.get(id);
    if (!conversation) {
      return new HttpResponse(JSON.stringify({ detail: "Not found" }), {
        status: 404,
      });
    }
    return toRuntimeConversation(conversation);
  }

  if (method === "GET" && pathname.endsWith("/events/count")) {
    return 0;
  }

  if (method === "GET" && pathname.endsWith("/events/search")) {
    return { items: [] };
  }

  if (method === "GET" && pathname === "/api/vscode/url") {
    return { url: null };
  }

  return new HttpResponse(
    JSON.stringify({ detail: `Unhandled cloud proxy path: ${envelope.path}` }),
    { status: 404 },
  );
}

export const CLOUD_PROXY_HANDLERS = [
  http.post("/api/cloud-proxy", async ({ request }) => {
    const envelope = (await request.json()) as CloudProxyEnvelope;
    const response = handleCloudRequest(envelope);

    if (response instanceof HttpResponse) {
      return response;
    }

    return HttpResponse.json(response);
  }),
];
