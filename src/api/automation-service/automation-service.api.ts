import { openHands } from "../open-hands-axios";
import type {
  Automation,
  AutomationsResponse,
  AutomationRunsResponse,
} from "#/types/automation";

const AUTOMATION_BASE_PATH = "/api/automation";

class AutomationService {
  static async listAutomations(
    params: { limit?: number; offset?: number } = {},
  ): Promise<AutomationsResponse> {
    const { limit = 50, offset = 0 } = params;
    const { data } = await openHands.get<AutomationsResponse>(
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
    const { data } = await openHands.get<Automation>(
      `${AUTOMATION_BASE_PATH}/v1/${id}`,
    );
    return data;
  }

  static async updateAutomation(
    id: string,
    body: Partial<Automation>,
  ): Promise<Automation> {
    const { data } = await openHands.patch<Automation>(
      `${AUTOMATION_BASE_PATH}/v1/${id}`,
      body,
    );
    return data;
  }

  static async deleteAutomation(id: string): Promise<void> {
    await openHands.delete(`${AUTOMATION_BASE_PATH}/v1/${id}`);
  }

  static async listAutomationRuns(
    id: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<AutomationRunsResponse> {
    const { limit = 50, offset = 0 } = params;
    const { data } = await openHands.get<AutomationRunsResponse>(
      `${AUTOMATION_BASE_PATH}/v1/${id}/runs`,
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
