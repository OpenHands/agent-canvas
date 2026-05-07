import axios from "axios";
import type {
  Automation,
  AutomationsResponse,
  AutomationRunsResponse,
} from "#/types/automation";
import { getAgentServerBaseUrl } from "../agent-server-config";

const AUTOMATION_BASE_PATH = "/api/automation";

// Create axios instance for automation API with Bearer auth
const automationAxios = axios.create({
  baseURL: getAgentServerBaseUrl(),
});

automationAxios.interceptors.request.use((config) => {
  const apiKey = import.meta.env.VITE_AUTOMATION_API_KEY?.trim();
  if (apiKey) {
    config.headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return config;
});

class AutomationService {
  static async listAutomations(
    params: { limit?: number; offset?: number } = {},
  ): Promise<AutomationsResponse> {
    const { limit = 50, offset = 0 } = params;
    const { data } = await automationAxios.get<AutomationsResponse>(
      `${AUTOMATION_BASE_PATH}/v1`,
      {
        params: { limit, offset },
      },
    );
    return data;
  }

  static async getAutomations(
    limit = 50,
    offset = 0,
  ): Promise<AutomationsResponse> {
    return AutomationService.listAutomations({ limit, offset });
  }

  static async getAutomation(id: string): Promise<Automation> {
    const { data } = await automationAxios.get<Automation>(
      `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}`,
    );
    return data;
  }

  static async updateAutomation(
    id: string,
    body: Partial<Automation>,
  ): Promise<Automation> {
    const { data } = await automationAxios.patch<Automation>(
      `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}`,
      body,
    );
    return data;
  }

  static async deleteAutomation(id: string): Promise<void> {
    await automationAxios.delete(
      `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}`,
    );
  }

  static async listAutomationRuns(
    id: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<AutomationRunsResponse> {
    const { limit = 50, offset = 0 } = params;
    const { data } = await automationAxios.get<AutomationRunsResponse>(
      `${AUTOMATION_BASE_PATH}/v1/${encodeURIComponent(id)}/runs`,
      { params: { limit, offset } },
    );
    return data;
  }

  static async getAutomationRuns(
    id: string,
    limit = 50,
    offset = 0,
  ): Promise<AutomationRunsResponse> {
    return AutomationService.listAutomationRuns(id, { limit, offset });
  }

  static async toggleAutomation(
    id: string,
    enabled: boolean,
  ): Promise<Automation> {
    return AutomationService.updateAutomation(id, { enabled });
  }
}

export default AutomationService;
