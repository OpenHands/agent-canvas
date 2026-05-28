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
  // ``/settings/agent`` always wins: it is the single place to switch
  // agent kinds (OpenHands / ACP) and the only sub-page that is always
  // available regardless of feature flags. Landing here keeps the
  // routing simple — ACP users no longer have to bounce through
  // ``/settings/llm`` (which is disabled for them), and OpenHands users
  // are one nav-click away from the LLM page.
  const fallbackOrder = [
    { path: "/settings/agent", hidden: false },
    { path: "/settings/llm", hidden: !!featureFlags?.hide_llm_settings },
    { path: "/settings", hidden: !!featureFlags?.hide_llm_settings },
    { path: "/settings/app", hidden: false },
    { path: "/settings/secrets", hidden: false },
  ];

  const firstAvailable = fallbackOrder.find((item) => !item.hidden);
  return firstAvailable?.path ?? null;
}
