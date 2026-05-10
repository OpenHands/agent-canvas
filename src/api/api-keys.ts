import { createApiKeysClient } from "./typescript-client";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string; // Full key, only returned once upon creation
  prefix: string;
  created_at: string;
}

class ApiKeysClient {
  /**
   * Get all API keys for the current user
   */
  static async getApiKeys(): Promise<ApiKey[]> {
    return createApiKeysClient().listApiKeys() as Promise<ApiKey[]>;
  }

  /**
   * Create a new API key
   * @param name - A descriptive name for the API key
   */
  static async createApiKey(name: string): Promise<CreateApiKeyResponse> {
    return createApiKeysClient().createApiKey(
      name,
    ) as Promise<CreateApiKeyResponse>;
  }

  /**
   * Delete an API key
   * @param id - The ID of the API key to delete
   */
  static async deleteApiKey(id: string): Promise<void> {
    await createApiKeysClient().deleteApiKey(id);
  }
}

export default ApiKeysClient;
