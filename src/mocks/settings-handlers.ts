import { http, delay, HttpResponse } from "msw";
import { WebClientConfig } from "#/api/option-service/option.types";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { Settings, SettingsValue } from "#/types/settings";

/** Simple recursive merge — objects merge, scalars overwrite. */
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
      typeof result[key] === "object" &&
      result[key] != null &&
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

const DEFAULT_AGENT_SETTINGS = DEFAULT_SETTINGS.agent_settings ?? {};
const llmDefaults = (DEFAULT_AGENT_SETTINGS as Record<string, unknown>).llm as
  | Record<string, unknown>
  | undefined;
const DEFAULT_MODEL =
  typeof llmDefaults?.model === "string"
    ? llmDefaults.model
    : "openhands/claude-opus-4-5-20251101";

export const createMockWebClientConfig = (
  overrides: Partial<WebClientConfig> = {},
): WebClientConfig => ({
  posthog_client_key: "test-posthog-key",
  feature_flags: {
    hide_llm_settings: false,
    hide_users_page: false,
    ...overrides.feature_flags,
  },
  providers_configured: [],
  maintenance_start_time: null,
  recaptcha_site_key: null,
  faulty_models: [],
  error_message: null,
  updated_at: new Date().toISOString(),
  ...overrides,
});

const MOCK_AGENT_SETTINGS_SCHEMA: NonNullable<
  Settings["agent_settings_schema"]
> = {
  model_name: "AgentSettings",
  sections: [
    {
      key: "llm",
      label: "LLM",
      fields: [
        {
          key: "llm.model",
          label: "Model",
          description: "Select the model to use for this conversation.",
          section: "llm",
          section_label: "LLM",
          value_type: "string",
          default: DEFAULT_MODEL,
          choices: [],
          depends_on: [],
          prominence: "critical",
          secret: false,
          required: true,
        },
        {
          key: "llm.api_key",
          label: "API Key",
          description:
            "Provide the API key used to authenticate requests for the selected model.",

          section: "llm",
          section_label: "LLM",
          value_type: "string",
          default: null,
          choices: [],
          depends_on: [],
          prominence: "critical",
          secret: true,
          required: false,
        },
        {
          key: "llm.base_url",
          description:
            "Override the model provider's default API base URL when needed.",

          label: "Base URL",
          section: "llm",
          section_label: "LLM",
          value_type: "string",
          default: null,
          choices: [],
          depends_on: [],
          prominence: "critical",
          secret: false,
          required: false,
        },
        {
          key: "llm.temperature",
          label: "Temperature",
          description: "Adjust randomness for non-deterministic model outputs.",
          section: "llm",
          section_label: "LLM",
          value_type: "number",
          default: null,
          choices: [],
          depends_on: [],
          prominence: "minor",
          secret: false,
          required: false,
        },
      ],
    },
    {
      key: "critic",
      label: "Critic",
      fields: [
        {
          description:
            "Enable an additional critic pass to review the agent's work.",

          key: "critic.enabled",
          label: "Enable critic",
          section: "critic",
          section_label: "Critic",
          value_type: "boolean",
          default: false,
          choices: [],
          depends_on: [],
          prominence: "critical",
          secret: false,
          required: true,
        },
        {
          description: "Choose when the critic should review and intervene.",

          key: "critic.mode",
          label: "Mode",
          section: "critic",
          section_label: "Critic",
          value_type: "string",
          default: "finish_and_message",
          choices: [
            { label: "finish_and_message", value: "finish_and_message" },
            { label: "all_actions", value: "all_actions" },
          ],
          depends_on: ["critic.enabled"],
          prominence: "minor",
          secret: false,
          required: true,
        },
      ],
    },
  ],
};

const MOCK_CONVERSATION_SETTINGS_SCHEMA: NonNullable<
  Settings["conversation_settings_schema"]
> = {
  model_name: "ConversationSettings",
  sections: [
    {
      key: "general",
      label: "General",
      fields: [
        {
          key: "max_iterations",
          label: "Max iterations",
          section: "general",
          description:
            "Maximum number of agent steps allowed before the conversation stops.",

          section_label: "General",
          value_type: "integer",
          default: 500,
          choices: [],
          depends_on: [],
          prominence: "major",
          secret: false,
          required: true,
        },
      ],
    },
    {
      key: "verification",
      label: "Verification",
      fields: [
        {
          key: "confirmation_mode",
          label: "Confirmation mode",
          description:
            "Pause for confirmation before the agent performs high-risk actions.",

          section: "verification",
          section_label: "Verification",
          value_type: "boolean",
          default: false,
          choices: [],
          depends_on: [],
          prominence: "major",
          secret: false,
          required: true,
        },
        {
          key: "security_analyzer",
          label: "Security analyzer",
          description:
            "Choose how OpenHands should analyze actions before asking for confirmation.",

          section: "verification",
          section_label: "Verification",
          value_type: "string",
          default: "llm",
          choices: [
            { label: "llm", value: "llm" },
            { label: "none", value: "none" },
          ],
          depends_on: ["confirmation_mode"],
          prominence: "major",
          secret: false,
          required: false,
        },
      ],
    },
  ],
};

export const MOCK_DEFAULT_USER_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  provider_tokens_set: {},
  agent_settings_schema: MOCK_AGENT_SETTINGS_SCHEMA,
  agent_settings: {
    ...DEFAULT_AGENT_SETTINGS,
    critic: {
      mode: "finish_and_message",
      enabled: false,
    },
    llm: {
      ...(llmDefaults ?? {}),
      api_key: null,
      model: DEFAULT_MODEL,
    },
  },
  conversation_settings_schema: MOCK_CONVERSATION_SETTINGS_SCHEMA,
  conversation_settings: {
    ...(DEFAULT_SETTINGS.conversation_settings ?? {}),
  },
};

const MOCK_USER_PREFERENCES: {
  settings: Settings | null;
} = {
  settings: structuredClone(MOCK_DEFAULT_USER_SETTINGS),
};

export const resetTestHandlersMockSettings = () => {
  MOCK_USER_PREFERENCES.settings = structuredClone(MOCK_DEFAULT_USER_SETTINGS);
};

// Mock model data used by provider/model endpoints
const MOCK_MODELS = [
  "anthropic/claude-3.5",
  "anthropic/claude-sonnet-4-20250514",
  "anthropic/claude-sonnet-4-5-20250929",
  "anthropic/claude-haiku-4-5-20251001",
  "anthropic/claude-opus-4-5-20251101",
  "openai/gpt-3.5-turbo",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openhands/claude-sonnet-4-20250514",
  "openhands/claude-sonnet-4-5-20250929",
  "openhands/claude-haiku-4-5-20251001",
  "openhands/claude-opus-4-5-20251101",
  "openhands/minimax-m2.7",
  "sambanova/Meta-Llama-3.1-8B-Instruct",
];

const MOCK_VERIFIED_MODELS = new Set([
  "anthropic/claude-opus-4-5-20251101",
  "anthropic/claude-sonnet-4-5-20250929",
  "openhands/claude-opus-4-5-20251101",
  "openhands/claude-sonnet-4-5-20250929",
  "openhands/minimax-m2.7",
]);

const MOCK_VERIFIED_PROVIDERS = [
  "openhands",
  "anthropic",
  "openai",
  "mistral",
  "gemini",
  "deepseek",
  "moonshot",
  "minimax",
];

const MOCK_MODEL_PROVIDERS = Array.from(
  new Set(
    MOCK_MODELS.map((model) => model.split("/")[0]).filter(
      (provider): provider is string => Boolean(provider),
    ),
  ),
);

const MOCK_VERIFIED_MODELS_BY_PROVIDER = MOCK_MODELS.reduce<
  Record<string, string[]>
>((acc, model) => {
  if (!MOCK_VERIFIED_MODELS.has(model)) return acc;

  const [provider, ...rest] = model.split("/");
  if (!provider || rest.length === 0) return acc;

  acc[provider] ??= [];
  acc[provider].push(rest.join("/"));
  return acc;
}, {});

// --- Handlers for options/config/settings ---

export const SETTINGS_HANDLERS = [
  http.get("/server_info", async () =>
    HttpResponse.json({
      uptime: 0,
      idle_time: 0,
      version: "1.18.1",
      usable_tools: [
        "terminal",
        "file_editor",
        "task_tracker",
        "browser_tool_set",
      ],
      agents: ["CodeActAgent"],
      default_agent: "CodeActAgent",
      models: MOCK_MODELS,
      security_analyzers: ["llm", "none"],
    }),
  ),

  http.get("/api/llm/models", async () =>
    HttpResponse.json({ models: MOCK_MODELS }),
  ),

  http.get("/api/llm/models/verified", async () =>
    HttpResponse.json({ models: MOCK_VERIFIED_MODELS_BY_PROVIDER }),
  ),

  http.get("/api/llm/providers", async () =>
    HttpResponse.json({ providers: MOCK_MODEL_PROVIDERS }),
  ),

  // V0 (legacy) models endpoint – still used for default_model
  http.get("/api/options/models", async () =>
    HttpResponse.json({
      models: MOCK_MODELS,
      verified_models: [
        "claude-opus-4-5-20251101",
        "claude-sonnet-4-5-20250929",
      ],
      verified_providers: MOCK_VERIFIED_PROVIDERS,
      default_model: "openhands/claude-opus-4-5-20251101",
    }),
  ),

  // V1 providers search
  http.get("/api/v1/config/providers/search", async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.toLowerCase();
    const verifiedEq = url.searchParams.get("verified__eq");

    // Build unique provider list from models
    const seen = new Set<string>();
    let providers: { name: string; verified: boolean }[] = [];
    for (const model of MOCK_MODELS) {
      const [providerName] = model.split("/");
      if (providerName && !seen.has(providerName)) {
        seen.add(providerName);
        providers.push({
          name: providerName,
          verified: MOCK_VERIFIED_PROVIDERS.includes(providerName),
        });
      }
    }

    if (query) {
      providers = providers.filter((p) => p.name.toLowerCase().includes(query));
    }
    if (verifiedEq !== null && verifiedEq !== undefined) {
      const wantVerified = verifiedEq === "true";
      providers = providers.filter((p) => p.verified === wantVerified);
    }

    return HttpResponse.json({ items: providers, next_page_id: null });
  }),

  // V1 models search
  http.get("/api/v1/config/models/search", async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.toLowerCase();
    const verifiedEq = url.searchParams.get("verified__eq");
    const providerEq = url.searchParams.get("provider__eq");

    let models = MOCK_MODELS.map((m) => {
      const [provider, ...rest] = m.split("/");
      const name = rest.join("/");
      return {
        provider: provider || null,
        name,
        verified: MOCK_VERIFIED_MODELS.has(m),
      };
    });

    if (providerEq) {
      models = models.filter((m) => m.provider === providerEq);
    }
    if (query) {
      models = models.filter((m) => m.name.toLowerCase().includes(query));
    }
    if (verifiedEq !== null && verifiedEq !== undefined) {
      const wantVerified = verifiedEq === "true";
      models = models.filter((m) => m.verified === wantVerified);
    }

    return HttpResponse.json({ items: models, next_page_id: null });
  }),

  http.get("/api/options/security-analyzers", async () =>
    HttpResponse.json(["llm", "none"]),
  ),

  http.get("/api/v1/web-client/config", () => {
    const config: WebClientConfig = {
      posthog_client_key: "fake-posthog-client-key",
      feature_flags: {
        hide_llm_settings: false,
        hide_users_page: false,
      },
      providers_configured: [],
      maintenance_start_time: null,
      recaptcha_site_key: null,
      faulty_models: [],
      error_message: null,
      updated_at: new Date().toISOString(),
    };

    return HttpResponse.json(config);
  }),

  http.get("/api/settings/conversation-schema", async () => {
    await delay();
    return HttpResponse.json(MOCK_CONVERSATION_SETTINGS_SCHEMA);
  }),

  http.get("/api/v1/settings/conversation-schema", async () => {
    await delay();
    return HttpResponse.json(MOCK_CONVERSATION_SETTINGS_SCHEMA);
  }),

  http.get("/api/v1/settings", async () => {
    await delay();
    const { settings } = MOCK_USER_PREFERENCES;

    if (!settings) return HttpResponse.json(null, { status: 404 });

    return HttpResponse.json(settings);
  }),

  // New settings API endpoints (GET /api/settings with X-Expose-Secrets header support)
  http.get("/api/settings", async ({ request }) => {
    await delay();
    const { settings } = MOCK_USER_PREFERENCES;

    if (!settings) {
      return HttpResponse.json({
        agent_settings: {},
        conversation_settings: {},
        llm_api_key_is_set: false,
      });
    }

    const exposeSecrets = request.headers.get("X-Expose-Secrets");

    // Build agent_settings, handling secrets based on header
    const agentSettings = structuredClone(
      settings.agent_settings ?? {},
    ) as Record<string, unknown>;
    const llm = agentSettings.llm as Record<string, unknown> | undefined;
    if (llm?.api_key) {
      if (exposeSecrets === "encrypted") {
        // Return a mock "encrypted" value
        llm.api_key = `gAAAAA_mock_encrypted_${String(llm.api_key).slice(0, 8)}`;
      } else if (exposeSecrets === "plaintext") {
        // Keep as-is (plaintext)
      } else {
        // Redact
        llm.api_key = "**********";
      }
    }

    const llmApiKeySet =
      !!settings.llm_api_key_set ||
      (!!(settings.agent_settings as Record<string, unknown> | undefined)
        ?.llm &&
        !!(
          (settings.agent_settings as Record<string, unknown>).llm as Record<
            string,
            unknown
          >
        )?.api_key);

    return HttpResponse.json({
      agent_settings: agentSettings,
      conversation_settings: settings.conversation_settings ?? {},
      llm_api_key_is_set: llmApiKeySet,
    });
  }),

  // PATCH /api/settings - incremental updates
  http.patch("/api/settings", async ({ request }) => {
    await delay();
    const body = (await request.json()) as {
      agent_settings_diff?: Record<string, unknown>;
      conversation_settings_diff?: Record<string, SettingsValue>;
    } | null;

    if (!body) {
      return HttpResponse.json({ error: "Empty body" }, { status: 400 });
    }

    if (!body.agent_settings_diff && !body.conversation_settings_diff) {
      return HttpResponse.json(
        {
          error:
            "At least one of agent_settings_diff or conversation_settings_diff must be provided",
        },
        { status: 400 },
      );
    }

    const current =
      MOCK_USER_PREFERENCES.settings ||
      structuredClone(MOCK_DEFAULT_USER_SETTINGS);
    const nextSettings: Settings = { ...current };

    if (body.agent_settings_diff) {
      const merged = deepMerge(
        (current.agent_settings ?? {}) as Record<string, unknown>,
        body.agent_settings_diff,
      );
      nextSettings.agent_settings = merged as Settings["agent_settings"];

      // Sync llm_api_key_set
      const llm = merged.llm as Record<string, unknown> | undefined;
      if (
        llm?.api_key &&
        typeof llm.api_key === "string" &&
        llm.api_key.trim().length > 0
      ) {
        nextSettings.llm_api_key_set = true;
      }
    }

    if (body.conversation_settings_diff) {
      nextSettings.conversation_settings = {
        ...(current.conversation_settings ?? {}),
        ...body.conversation_settings_diff,
      };
    }

    MOCK_USER_PREFERENCES.settings = nextSettings;

    // Return the updated settings (without secrets exposed)
    return HttpResponse.json({
      agent_settings: nextSettings.agent_settings ?? {},
      conversation_settings: nextSettings.conversation_settings ?? {},
      llm_api_key_is_set: nextSettings.llm_api_key_set ?? false,
    });
  }),

  http.get("/api/settings/agent-schema", async () => {
    await delay();
    return HttpResponse.json(MOCK_AGENT_SETTINGS_SCHEMA);
  }),

  http.get("/api/v1/settings/agent-schema", async () => {
    await delay();
    return HttpResponse.json(MOCK_AGENT_SETTINGS_SCHEMA);
  }),

  http.post("/api/v1/settings", async ({ request }) => {
    await delay();
    const body = (await request.json()) as Record<string, unknown> | null;

    if (body) {
      const current =
        MOCK_USER_PREFERENCES.settings ||
        structuredClone(MOCK_DEFAULT_USER_SETTINGS);

      if ("agent_settings" in body || "conversation_settings" in body) {
        return HttpResponse.json(
          {
            error: "Use *_diff nested settings payloads",
            keys: ["agent_settings", "conversation_settings"].filter(
              (key) => key in body,
            ),
          },
          { status: 422 },
        );
      }

      const nextSettings: Settings = { ...current };

      const agentSettingsPatch = body.agent_settings_diff as
        | Record<string, unknown>
        | undefined;
      if (agentSettingsPatch) {
        const merged = deepMerge(
          (current.agent_settings ?? {}) as Record<string, unknown>,
          agentSettingsPatch,
        );
        nextSettings.agent_settings = merged as Settings["agent_settings"];
      }

      const conversationSettingsPatch = body.conversation_settings_diff as
        | Record<string, SettingsValue>
        | undefined;
      if (conversationSettingsPatch) {
        nextSettings.conversation_settings = {
          ...(current.conversation_settings ?? {}),
          ...conversationSettingsPatch,
        };
      }

      // Apply top-level fields (excluding nested settings)
      for (const [key, value] of Object.entries(body)) {
        if (
          key !== "agent_settings_diff" &&
          key !== "conversation_settings_diff" &&
          key !== "agent_settings_schema" &&
          key !== "conversation_settings_schema"
        ) {
          (nextSettings as Record<string, unknown>)[key] = value;
        }
      }

      MOCK_USER_PREFERENCES.settings = nextSettings;
      return HttpResponse.json(null, { status: 200 });
    }

    return HttpResponse.json(null, { status: 400 });
  }),
];
