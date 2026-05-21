import { WebClientFeatureFlags } from "#/api/option-service/option.types";
import { Settings, SettingsValue } from "#/types/settings";
import { getProviderId } from "#/utils/map-provider";

const extractBasicFormData = (formData: FormData) => {
  const providerDisplay = formData.get("llm-provider-input")?.toString();
  const provider = providerDisplay ? getProviderId(providerDisplay) : undefined;
  const model = formData.get("llm-model-input")?.toString();

  return {
    llmModel: provider && model ? `${provider}/${model}` : undefined,
    llmApiKey: formData.get("llm-api-key-input")?.toString(),
    agent: formData.get("agent")?.toString(),
    language: formData.get("language")?.toString(),
  };
};

export const parseMaxBudgetPerTask = (value: string): number | null => {
  if (!value) {
    return null;
  }

  const parsedValue = parseFloat(value);
  return parsedValue && parsedValue >= 1 && Number.isFinite(parsedValue)
    ? parsedValue
    : null;
};

export const extractSettings = (
  formData: FormData,
): Partial<Settings> & Record<string, unknown> => {
  const { llmModel, llmApiKey, agent, language } =
    extractBasicFormData(formData);

  const llm: Record<string, unknown> = {};
  if (llmModel) llm.model = llmModel;
  if (llmApiKey !== undefined) llm.api_key = llmApiKey;

  const agentSettings: Record<string, SettingsValue> = {};
  if (Object.keys(llm).length > 0)
    agentSettings.llm = llm as Record<string, SettingsValue>;
  if (agent) agentSettings.agent = agent;

  return {
    ...(Object.keys(agentSettings).length > 0
      ? { agent_settings_diff: agentSettings }
      : {}),
    ...(language ? { language } : {}),
  };
};

export function isSettingsPageHidden(
  path: string,
  featureFlags: WebClientFeatureFlags | undefined,
): boolean {
  if (featureFlags?.hide_llm_settings && path === "/settings/llm") return true;
  return false;
}

export function getFirstAvailablePath(
  featureFlags: WebClientFeatureFlags | undefined,
): string | null {
  // ``/settings/agent`` precedes ``/settings`` because it is the ACP
  // landing page and is always available (no feature flag hides it).
  // When ``hide_llm_settings`` is on, the user is steered there rather
  // than to ``/settings/app`` (an unrelated section that used to win the
  // fallback). For OpenHands-agent users this is also a sensible landing
  // — the Agent page is the single place to switch kinds.
  const fallbackOrder = [
    { path: "/settings/llm", hidden: !!featureFlags?.hide_llm_settings },
    { path: "/settings/agent", hidden: false },
    { path: "/settings", hidden: !!featureFlags?.hide_llm_settings },
    { path: "/settings/app", hidden: false },
    { path: "/settings/secrets", hidden: false },
  ];

  const firstAvailable = fallbackOrder.find((item) => !item.hidden);
  return firstAvailable?.path ?? null;
}
