# LLM Profiles Backend Design Note

## Current assessment

The current implementation is **consistent for every `local` backend**, where
"local" means any backend that speaks the agent-server protocol, including a
remote agent-server URL registered as `kind: "local"`. Those backends all use the
SDK `ProfilesClient` and the same profile lifecycle.

The implementation is **not yet consistent between agent-server backends and
OpenHands Cloud**. Cloud still uses raw LLM settings as the user-facing settings
surface, while local/remote agent-server backends expose named LLM profiles. That
split is deliberate in the current code, but it is the remaining tech debt from
issue #533: callers still branch on `backend.kind` for copy, routing, command
handling, and conversation-start mechanics.

## Evidence from the codebase

### 1. The `/settings` route is explicitly backend-specific

`src/routes/llm-settings.tsx` currently renders profile management only for
agent-server backends and falls back to the raw settings form for cloud:

```tsx
export default function LlmSettingsRoute() {
  const { backend } = useActiveBackend();
  const isCloud = backend.kind === "cloud";

  // Cloud backends use the standard LLM settings form (no profiles support)
  if (isCloud) {
    return <LlmSettingsScreen />;
  }

  // Local backends use the profile management view
  return <LlmSettingsLocalView />;
}
```

The settings navigation and chat model affordance mirror the same distinction:

```tsx
const renamedItem =
  item.to === "/settings"
    ? {
        ...item,
        text:
          backend.kind === "local" ? I18nKey.SETTINGS$LLM_PROFILES : item.text,
        subtitle:
          backend.kind === "local"
            ? I18nKey.SETTINGS$PAGE_LLM_PROFILES_SUBLINE
            : item.subtitle,
      }
    : item;
```

```tsx
const destinationLabel = t(
  isAcpContext
    ? I18nKey.SETTINGS$NAV_AGENT
    : backend.kind === "cloud"
      ? I18nKey.SETTINGS$LLM_SETTINGS
      : I18nKey.SETTINGS$LLM_PROFILES,
);
```

### 2. Local/remote agent-server profiles go through one thin service

`src/api/profiles-service/profiles-service.api.ts` is a good abstraction: it is a
thin SDK-client wrapper and does not care whether the agent-server is on
localhost or a remote URL, as long as the active backend is `kind: "local"`.

```ts
class ProfilesService {
  static async listProfiles(): Promise<ProfileListResponse> {
    return new ProfilesClient(getAgentServerClientOptions()).listProfiles();
  }

  static async getProfile(
    name: string,
    exposeSecrets?: ExposeSecretsMode,
  ): Promise<ProfileDetailResponse> {
    const options: GetProfileOptions = exposeSecrets ? { exposeSecrets } : {};
    return new ProfilesClient(getAgentServerClientOptions()).getProfile(
      name,
      options,
    );
  }

  static async saveProfile(
    name: string,
    request: SaveProfileRequest,
  ): Promise<ProfileMutationResponse> {
    return new ProfilesClient(getAgentServerClientOptions()).saveProfile(
      name,
      request,
    );
  }

  static async activateProfile(name: string): Promise<ActivateProfileResponse> {
    return new ProfilesClient(getAgentServerClientOptions()).activateProfile(
      name,
    );
  }
}
```

### 3. Cloud settings are normalized enough to reuse the raw LLM form, not profiles

Cloud settings still arrive mostly flat from `/api/v1/settings`. The frontend
adapts them into `agent_settings.llm` so `LlmSettingsScreen` can render, but this
is **not** a profile abstraction:

```ts
/**
 * The cloud Settings response is mostly flat — top-level fields like
 * `llm_model`, `provider_tokens_set`, etc., rather than the nested
 * `{ agent_settings, conversation_settings }` shape the local agent-server
 * uses.
 */
type CloudSettingsResponse = {
  llm_model?: string;
  llm_base_url?: string;
  llm_api_key?: string | null;
  llm_api_key_set?: boolean;
  agent_settings?: Record<string, SettingsValue> | null;
  conversation_settings?: Record<string, SettingsValue> | null;
  [key: string]: unknown;
};

function deriveAgentSettings(
  flat: CloudSettingsResponse,
): Record<string, SettingsValue> {
  if (flat.agent_settings && Object.keys(flat.agent_settings).length > 0) {
    return flat.agent_settings;
  }
  const agent: Record<string, SettingsValue> = {};
  const llm: Record<string, SettingsValue> = {};
  if (typeof flat.llm_model === "string") llm.model = flat.llm_model;
  if (typeof flat.llm_base_url === "string") llm.base_url = flat.llm_base_url;
  if (typeof flat.llm_api_key === "string") llm.api_key = flat.llm_api_key;
  if (Object.keys(llm).length > 0) agent.llm = llm;
  return agent;
}
```

### 4. Conversation start is unified only after settings materialize to `agent_settings.llm`

Local/remote agent-server conversation start uses encrypted settings from the
agent-server. If a profile is active, the server has already materialized that
profile into `agent_settings.llm`, and the frontend sends that config to the
conversation runtime.

```ts
static async getSettingsForConversation(): Promise<{
  agentSettings: Record<string, SettingsValue>;
  conversationSettings: Record<string, SettingsValue>;
  secretsEncrypted: boolean;
}> {
  // Fetch encrypted settings - this MUST succeed for conversations to work.
  // Do not fall back to redacted settings as that would cause auth failures.
  const response = await this.fetchSettingsFromApi("encrypted");
  return {
    agentSettings: response.agent_settings,
    conversationSettings: response.conversation_settings,
    secretsEncrypted: true,
  };
}
```

```ts
export async function buildStartConversationRequestWithEncryptedSettings(...) {
  const [settingsResult, customSecrets] = await Promise.all([
    SettingsService.getSettingsForConversation(),
    SecretsService.getSecrets(),
  ]);

  const { agentSettings, conversationSettings, secretsEncrypted } =
    settingsResult;

  await assertSubscriptionAuthReady(agentSettings);

  return buildStartConversationRequest({
    ...options,
    encryptedAgentSettings: agentSettings,
    encryptedConversationSettings: conversationSettings,
    secretsEncrypted,
    customSecrets,
  });
}
```

Once materialized, the actual LLM payload is the same `agent_settings.llm` shape:

```ts
function buildConfiguredOpenHandsAgentSettings(
  settings: Settings,
): AgentSettingsPayload {
  const agentSettings = toRecord(settings.agent_settings);
  const llm = toRecord(agentSettings.llm);

  llm.model =
    typeof llm.model === "string" && llm.model.trim().length > 0
      ? llm.model
      : DEFAULT_SETTINGS.llm_model;

  llm.stream = true;
  // ...normalize api_key/base_url/auth_type...

  return {
    ...agentSettings,
    llm,
    agent_context: buildAgentContext(agentSettings),
    tools: getAgentTools(agentSettings),
  };
}
```

Cloud conversation start does not use this profile/settings round trip. It posts
an app-conversation request and relies on Cloud to hold and apply the raw user
LLM settings server-side.

### 5. Profile switching is implemented only for agent-server backends

The service layer hard-stops cloud profile switching:

```ts
static async switchProfile(
  conversationId: string | null,
  profileName: string,
): Promise<void> {
  if (getActiveBackend().backend.kind === "cloud") {
    throw new Error(
      "LLM profile switching is only supported for local agent-server backends.",
    );
  }

  if (!conversationId) {
    await new ProfilesClient(getAgentServerClientOptions()).activateProfile(
      profileName,
    );
    return;
  }

  const profile = await new ProfilesClient(clientOptions).getProfile(
    profileName,
    { exposeSecrets: "encrypted" },
  );
  await conversationClient.switchLLM(conversationId, {
    ...profile.config,
    model,
    stream: true,
    usage_id: `profile:${profileName}:${uuidv4()}`,
  } as LLMConfig);
}
```

The `/model` command also gates itself to local backends:

```ts
const isLocal = backend.kind === "local";

if (!isModel || !isLocal) {
  onSubmit(message);
  return;
}
```

## WDYT

The design is in a reasonable transitional state, but I would **not** call it
fully consistent yet:

- Good: local and remote agent-server backends are unified behind
  `ProfilesClient`, `getAgentServerClientOptions()`, and `agent_settings.llm`.
- Good: runtime conversation creation no longer needs to know the profile name;
  it consumes the effective LLM config, which is the right eventual seam.
- Good: per-conversation switching avoids forwarding plaintext secrets by
  fetching encrypted profile config and calling the typed `switchLLM` client.
- Remaining inconsistency: cloud has no profile lifecycle API/store in this repo,
  so UX labels, route rendering, `/model`, and switching all branch on
  `backend.kind`.
- Remaining inconsistency: the Cloud settings adapter derives
  `agent_settings.llm` only to reuse the raw settings form; it does not expose a
  named profile model to the rest of the UI.

## Low-hanging clarification / tech debt

Addressed alongside this note: `useLlmProfiles()` now disables itself by default
when the active backend is Cloud, so components no longer issue a local-only
profile request while Cloud is active.

Remaining low-hanging cleanup:

1. **Centralize the capability check.** Replace scattered checks such as
   `backend.kind === "local"` / `backend.kind === "cloud"` with a helper like
   `supportsLlmProfiles(backend)` or `getLlmConfigurationMode(backend)`. Today
   the route, settings nav, chat model label, `/model` interceptor, and service
   layer each encode the rule separately.

2. **Choose a Cloud profile storage owner before changing UX copy.** If Cloud
   profiles should be first-class, prefer an app/backend-owned store over browser
   localStorage for any secret-bearing profile data. A client-side profile store
   is fine only if it stores non-secret metadata and materializes secrets through
   existing server-side Cloud settings/secrets mechanisms.

3. **Define switch semantics once.** The current local model has two meanings:
   home-page switch activates a default profile for future conversations; in-chat
   switch changes only the running conversation. Cloud should intentionally match
   or intentionally differ from that behavior before `/model` is enabled there.

4. **Keep `agent_settings.llm` as the materialization seam.** Even if Cloud
   profile storage differs, the UI should ideally resolve a selected profile into
   the same effective `agent_settings.llm` shape before save/start/switch paths.
   That is the cleanest way to avoid reintroducing `if local do X, if SaaS do Y`
   deeper in conversation code.
