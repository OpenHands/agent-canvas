import { SettingsClient } from "@openhands/typescript-client/clients";
import { getActiveBackend } from "./backend-registry/active-store";
import {
  createCloudSecret,
  deleteCloudSecret,
  fetchCloudSecrets,
  updateCloudSecret,
} from "./cloud/secrets-service.api";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import { CustomSecretWithoutValue } from "./secrets-service.types";

/**
 * Retry helper for API calls with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries - 1) {
        throw error;
      }

      const delay = baseDelayMs * 2 ** attempt;

      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }

  throw new Error("Retry attempts exhausted");
}

export class SecretsService {
  /**
   * List all custom secrets (names and descriptions only, no values).
   * Uses the agent-server API endpoint: GET /api/settings/secrets
   *
   * Note: The agent-server API doesn't support pagination or search filtering.
   * All secrets are returned in a single response.
   */
  static async getSecrets(): Promise<CustomSecretWithoutValue[]> {
    try {
      if (getActiveBackend().backend.kind === "cloud") {
        return await withRetry(() => fetchCloudSecrets());
      }
      const response = await withRetry(() =>
        new SettingsClient(getAgentServerClientOptions()).listSecrets(),
      );
      return response.secrets.map((s) => ({
        name: s.name,
        description: s.description,
      }));
    } catch (error) {
      console.error("Failed to fetch secrets after retries:", error);
      return [];
    }
  }

  /**
   * Create or update a custom secret (upsert by name).
   * Uses the agent-server API endpoint: PUT /api/settings/secrets
   *
   * @param name - Secret name (must start with letter, contain only letters/numbers/underscores, 1-64 chars)
   * @param value - Secret value
   * @param description - Optional description
   * @throws Error if the API call fails after retries
   */
  static async createSecret(
    name: string,
    value: string,
    description?: string,
  ): Promise<void> {
    if (getActiveBackend().backend.kind === "cloud") {
      await withRetry(() => createCloudSecret(name, value, description));
      return;
    }
    await withRetry(() =>
      new SettingsClient(getAgentServerClientOptions()).upsertSecret({
        name,
        value,
        description,
      }),
    );
  }

  /**
   * Update a secret's value and/or description.
   * Uses the same upsert endpoint as createSecret since agent-server
   * doesn't have a separate update endpoint.
   *
   * @param name - Secret name (used as identifier)
   * @param value - New secret value
   * @param description - Optional new description
   * @throws Error if the API call fails after retries
   */
  static async updateSecret(
    name: string,
    value: string,
    description?: string,
  ): Promise<void> {
    if (getActiveBackend().backend.kind === "cloud") {
      // The cloud PUT endpoint renames + redescribes only (no value field),
      // matching what `useUpdateSecret` actually sends:
      // (secretToEdit=name, newName=value, description).
      await withRetry(() => updateCloudSecret(name, value, description));
      return;
    }
    // Agent-server uses upsert, so update is the same as create
    await this.createSecret(name, value, description);
  }

  /**
   * Delete a custom secret by name.
   * Uses the agent-server API endpoint: DELETE /api/settings/secrets/{name}
   *
   * @param name - Secret name to delete
   * @throws Error if the API call fails (except 404, which is treated as success)
   */
  static async deleteSecret(name: string): Promise<void> {
    try {
      if (getActiveBackend().backend.kind === "cloud") {
        await withRetry(() => deleteCloudSecret(name));
        return;
      }
      await withRetry(() =>
        new SettingsClient(getAgentServerClientOptions()).deleteSecret(name),
      );
    } catch (error) {
      // 404 means secret doesn't exist - treat as successful deletion
      if (
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        return;
      }
      throw error;
    }
  }
}
