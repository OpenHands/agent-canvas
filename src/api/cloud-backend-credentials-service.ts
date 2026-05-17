import axios from "axios";
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

function readCloudBackendCredential(value: unknown) {
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

  return {
    id,
    name,
    host,
    cloudApiKey,
  };
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

function buildHeaders(hasBody: boolean, backend = getEffectiveLocalBackend()) {
  return {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...buildAuthHeaders(backend),
  };
}

function normalizeHost(host?: string): string {
  return (host || DEFAULT_OPENHANDS_CLOUD_HOST).trim().replace(/\/+$/, "");
}

function logSetupBackendsError(message: string, error?: unknown) {
  if (error === undefined) {
    console.error(`[setup/backends] ${message}`);
    return;
  }

  console.error(`[setup/backends] ${message}`, formatSafeError(error));
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

function makeCredentialError(
  operation: string,
  error: unknown,
  detail?: string,
): CloudBackendCredentialsError {
  return new CloudBackendCredentialsError(
    error instanceof SyntaxError
      ? "Malformed response from setup server"
      : detail
        ? `Failed to ${operation} OpenHands Cloud credentials (${detail})`
        : `Failed to ${operation} OpenHands Cloud credentials`,
  );
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

async function readSetupBackendsThrownErrorMessage(
  error: unknown,
): Promise<string> {
  if (axios.isAxiosError(error) && error.response) {
    const serverMessage = readErrorMessageFromPayload(error.response.data);
    return serverMessage
      ? `${error.response.status}: ${serverMessage}`
      : String(error.response.status);
  }

  return error instanceof Response
    ? readSetupBackendsErrorMessage(error)
    : formatSafeError(error);
}

export async function getStoredCloudBackendCredentials(
  options: { signal?: AbortSignal } = {},
): Promise<StoredCloudBackendCredential[]> {
  const backend = getEffectiveLocalBackend();
  try {
    const response = await fetch(SETUP_BACKENDS_ENDPOINT, {
      method: "GET",
      headers: buildHeaders(false, backend),
      signal: options.signal,
    });
    if (!response.ok) {
      const message = await readSetupBackendsErrorMessage(response);
      logSetupBackendsError(
        `Failed to load Cloud backend credentials: ${message}`,
      );
      throw new CloudBackendCredentialsError(
        `Failed to load saved OpenHands Cloud credentials (${message})`,
        response.status,
      );
    }
    const json = await response.json();
    return readCloudBackendCredentialsFromPayload(json);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof CloudBackendCredentialsError) throw error;
    const message = await readSetupBackendsThrownErrorMessage(error);
    logSetupBackendsError(
      error instanceof SyntaxError
        ? "Malformed JSON response from setup server"
        : "Failed to load Cloud backend credentials",
      message,
    );
    throw new CloudBackendCredentialsError(
      error instanceof SyntaxError
        ? "Malformed response from setup server"
        : `Failed to load saved OpenHands Cloud credentials (${message})`,
    );
  }
}

export async function saveCloudBackendCredential(
  { id, name, host, cloudApiKey }: StoredCloudBackendCredential,
  options: { signal?: AbortSignal } = {},
): Promise<StoredCloudBackendCredential> {
  const backend = getEffectiveLocalBackend();
  try {
    const response = await fetch(SETUP_BACKENDS_ENDPOINT, {
      method: "POST",
      headers: buildHeaders(true, backend),
      body: JSON.stringify({
        id,
        name,
        host: normalizeHost(host),
        kind: "cloud",
        api_key: cloudApiKey,
      }),
      signal: options.signal,
    });
    if (!response.ok) {
      const message = await readSetupBackendsErrorMessage(response);
      logSetupBackendsError(
        `Failed to save Cloud backend credential: ${message}`,
      );
      throw new CloudBackendCredentialsError(
        `Failed to save OpenHands Cloud credentials (${message})`,
        response.status,
      );
    }
    const json = await response.json();
    const saved = readCloudBackendCredentialFromPayload(json);
    if (!saved) {
      throw new CloudBackendCredentialsError(
        "Malformed response from setup server",
      );
    }
    return saved;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof CloudBackendCredentialsError) throw error;
    const message = await readSetupBackendsThrownErrorMessage(error);
    logSetupBackendsError(
      error instanceof SyntaxError
        ? "Malformed JSON response from setup server"
        : "Failed to save Cloud backend credential",
      message,
    );
    throw makeCredentialError("save", error, message);
  }
}

export async function deleteCloudBackendCredential(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const trimmedId = id.trim();
  if (!trimmedId) return;

  const backend = getEffectiveLocalBackend();
  try {
    const response = await fetch(
      `${SETUP_BACKENDS_ENDPOINT}?id=${encodeURIComponent(trimmedId)}`,
      {
        method: "DELETE",
        headers: buildHeaders(false, backend),
        signal: options.signal,
      },
    );
    if (!response.ok) {
      const message = await readSetupBackendsErrorMessage(response);
      logSetupBackendsError(
        `Failed to delete Cloud backend credential: ${message}`,
      );
      throw new CloudBackendCredentialsError(
        `Failed to delete OpenHands Cloud credentials (${message})`,
        response.status,
      );
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof CloudBackendCredentialsError) throw error;
    const message = await readSetupBackendsThrownErrorMessage(error);
    logSetupBackendsError("Failed to delete Cloud backend credential", message);
    throw makeCredentialError("delete", error, message);
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
    const key = readString(response?.key);
    return key;
  } catch (error) {
    if (signal?.aborted) throw error;
    const message = await readSetupBackendsThrownErrorMessage(error);
    logSetupBackendsError(
      "Failed to fetch OpenHands-provided LM API key from Cloud",
      message,
    );
    throw new CloudBackendCredentialsError(
      `Failed to fetch OpenHands-provided LM API key (${message})`,
    );
  }
}
