import axios from "axios";
import { getAgentServerHeaders } from "./agent-server-config";
import { getEffectiveLocalBackend } from "./backend-registry/active-store";
import { buildAuthHeaders } from "./backend-registry/auth";
import type { Backend } from "./backend-registry/types";
import { callCloudProxy } from "./cloud/proxy";
import {
  DEFAULT_OPENHANDS_CLOUD_HOST,
  OPENHANDS_CLOUD_DISPLAY_NAME,
} from "#/utils/constants";

const SETUP_BACKENDS_ENDPOINT = "/setup/backends";
const DEFAULT_OPENHANDS_CLOUD_BACKEND_ID = "openhands-cloud";

export interface StoredCloudBackendCredential {
  id: string;
  name: string;
  host: string;
  cloudApiKey: string;
}

export class CloudBackendCredentialsError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CloudBackendCredentialsError";
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function normalizeHost(host?: string): string {
  return (host || DEFAULT_OPENHANDS_CLOUD_HOST).trim().replace(/\/+$/, "");
}

function formatSafeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function readErrorMessageFromPayload(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object") return null;
  const record = value as { error?: unknown; message?: unknown };
  return readString(record.error) ?? readString(record.message);
}

function readCloudBackendCredential(
  value: unknown,
): StoredCloudBackendCredential | null {
  if (!value || typeof value !== "object") return null;
  const record = value as {
    id?: unknown;
    name?: unknown;
    host?: unknown;
    kind?: unknown;
    api_key?: unknown;
  };
  if (record.kind !== "cloud") return null;

  const id = readString(record.id);
  const name = readString(record.name);
  const host = readString(record.host);
  const cloudApiKey = readString(record.api_key);
  if (!id || !name || !host || !cloudApiKey) return null;

  return { id, name, host: normalizeHost(host), cloudApiKey };
}

function readCloudBackendCredentialsFromPayload(
  value: unknown,
): StoredCloudBackendCredential[] {
  if (!value || typeof value !== "object") return [];
  const backends = (value as { backends?: unknown }).backends;
  if (!Array.isArray(backends)) return [];
  return backends
    .map(readCloudBackendCredential)
    .filter((backend): backend is StoredCloudBackendCredential =>
      Boolean(backend),
    );
}

function readCloudBackendCredentialFromPayload(
  value: unknown,
): StoredCloudBackendCredential | null {
  if (!value || typeof value !== "object") return null;
  return readCloudBackendCredential((value as { backend?: unknown }).backend);
}

function buildSetupHeaders(hasBody: boolean): Record<string, string> {
  return {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...buildAuthHeaders(getEffectiveLocalBackend()),
    ...getAgentServerHeaders(),
  };
}

async function readSetupBackendsErrorMessage(
  response: Response,
): Promise<string> {
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  const serverMessage = readErrorMessageFromPayload(body);
  return serverMessage
    ? `${response.status}: ${serverMessage}`
    : String(response.status);
}

async function readThrownErrorMessage(error: unknown): Promise<string> {
  if (axios.isAxiosError(error) && error.response) {
    const serverMessage = readErrorMessageFromPayload(error.response.data);
    return serverMessage
      ? `${error.response.status}: ${serverMessage}`
      : String(error.response.status);
  }

  return formatSafeError(error);
}

function makeSetupError(operation: string, message: string, status?: number) {
  return new CloudBackendCredentialsError(
    `Failed to ${operation} OpenHands Cloud credentials (${message})`,
    status,
  );
}

export async function getStoredCloudBackendCredentials(
  options: { signal?: AbortSignal } = {},
): Promise<StoredCloudBackendCredential[]> {
  try {
    const response = await fetch(SETUP_BACKENDS_ENDPOINT, {
      method: "GET",
      headers: buildSetupHeaders(false),
      signal: options.signal,
    });

    if (!response.ok) {
      const message = await readSetupBackendsErrorMessage(response);
      throw makeSetupError("load saved", message, response.status);
    }

    return readCloudBackendCredentialsFromPayload(await response.json());
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof CloudBackendCredentialsError) throw error;
    const message = await readThrownErrorMessage(error);
    throw makeSetupError("load saved", message);
  }
}

export async function saveCloudBackendCredential(
  credential: StoredCloudBackendCredential,
  options: { signal?: AbortSignal } = {},
): Promise<StoredCloudBackendCredential> {
  const normalizedCredential = {
    id: credential.id.trim(),
    name: credential.name.trim(),
    host: normalizeHost(credential.host),
    kind: "cloud",
    api_key: credential.cloudApiKey.trim(),
  };

  try {
    const response = await fetch(SETUP_BACKENDS_ENDPOINT, {
      method: "POST",
      headers: buildSetupHeaders(true),
      body: JSON.stringify(normalizedCredential),
      signal: options.signal,
    });

    if (!response.ok) {
      const message = await readSetupBackendsErrorMessage(response);
      throw makeSetupError("save", message, response.status);
    }

    const saved = readCloudBackendCredentialFromPayload(await response.json());
    if (!saved) {
      throw new CloudBackendCredentialsError(
        "Malformed response from setup server",
      );
    }
    return saved;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof CloudBackendCredentialsError) throw error;
    const message = await readThrownErrorMessage(error);
    throw makeSetupError("save", message);
  }
}

export async function deleteCloudBackendCredential(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const trimmedId = id.trim();
  if (!trimmedId) return;

  try {
    const response = await fetch(
      `${SETUP_BACKENDS_ENDPOINT}/${encodeURIComponent(trimmedId)}`,
      {
        method: "DELETE",
        headers: buildSetupHeaders(false),
        signal: options.signal,
      },
    );

    if (!response.ok) {
      const message = await readSetupBackendsErrorMessage(response);
      throw makeSetupError("delete", message, response.status);
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof CloudBackendCredentialsError) throw error;
    const message = await readThrownErrorMessage(error);
    throw makeSetupError("delete", message);
  }
}

export function makeDefaultOpenHandsCloudCredential(
  cloudApiKey: string,
): StoredCloudBackendCredential {
  return {
    id: DEFAULT_OPENHANDS_CLOUD_BACKEND_ID,
    name: OPENHANDS_CLOUD_DISPLAY_NAME,
    host: DEFAULT_OPENHANDS_CLOUD_HOST,
    cloudApiKey,
  };
}

export async function getOpenHandsProvidedLlmApiKey({
  cloudApiKey,
  host = DEFAULT_OPENHANDS_CLOUD_HOST,
  signal,
}: {
  cloudApiKey: string;
  host?: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  const apiKey = cloudApiKey.trim();
  if (!apiKey) return null;

  try {
    // callCloudProxy accepts a Backend because it needs host + bearer auth.
    // This object is only a request envelope; it is never registered or saved.
    const cloudProxyAuthBackend: Backend = {
      id: DEFAULT_OPENHANDS_CLOUD_BACKEND_ID,
      name: OPENHANDS_CLOUD_DISPLAY_NAME,
      host: normalizeHost(host),
      apiKey,
      kind: "cloud",
    };

    const response = await callCloudProxy<{ key?: unknown }>({
      backend: cloudProxyAuthBackend,
      method: "GET",
      path: "/api/keys/llm/byor",
      signal,
    });
    return readString(response?.key);
  } catch (error) {
    if (signal?.aborted) throw error;
    const message = await readThrownErrorMessage(error);
    console.error(
      "Failed to fetch OpenHands-provided LM API key from Cloud",
      message,
    );
    throw new CloudBackendCredentialsError(
      `Failed to fetch OpenHands-provided LM API key (${message})`,
    );
  }
}
