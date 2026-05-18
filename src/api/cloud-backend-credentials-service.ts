import axios from "axios";
import {
  getRegisteredBackends,
  updateRegisteredBackends,
} from "./backend-registry/active-store";
import type { Backend } from "./backend-registry/types";
import { callCloudProxy } from "./cloud/proxy";
import {
  DEFAULT_OPENHANDS_CLOUD_HOST,
  OPENHANDS_CLOUD_DISPLAY_NAME,
} from "#/utils/constants";

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

function toStoredCloudBackendCredential(
  backend: Backend,
): StoredCloudBackendCredential | null {
  if (backend.kind !== "cloud") return null;

  const cloudApiKey = backend.apiKey.trim();
  if (!cloudApiKey) return null;

  return {
    id: backend.id,
    name: backend.name,
    host: normalizeHost(backend.host),
    cloudApiKey,
  };
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

async function readThrownErrorMessage(error: unknown): Promise<string> {
  if (axios.isAxiosError(error) && error.response) {
    const serverMessage = readErrorMessageFromPayload(error.response.data);
    return serverMessage
      ? `${error.response.status}: ${serverMessage}`
      : String(error.response.status);
  }

  return formatSafeError(error);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

export async function getStoredCloudBackendCredentials(
  options: { signal?: AbortSignal } = {},
): Promise<StoredCloudBackendCredential[]> {
  throwIfAborted(options.signal);
  return getRegisteredBackends()
    .map(toStoredCloudBackendCredential)
    .filter((credential): credential is StoredCloudBackendCredential =>
      Boolean(credential),
    );
}

export async function saveCloudBackendCredential(
  credential: StoredCloudBackendCredential,
  options: { signal?: AbortSignal } = {},
): Promise<StoredCloudBackendCredential> {
  throwIfAborted(options.signal);

  const normalizedCredential: StoredCloudBackendCredential = {
    ...credential,
    host: normalizeHost(credential.host),
    cloudApiKey: credential.cloudApiKey.trim(),
  };

  if (!normalizedCredential.id.trim() || !normalizedCredential.cloudApiKey) {
    throw new CloudBackendCredentialsError(
      "Cloud backend credential is invalid",
    );
  }

  let savedCredential = normalizedCredential;
  const nextBackend: Backend = {
    id: normalizedCredential.id,
    name: normalizedCredential.name,
    host: normalizedCredential.host,
    apiKey: normalizedCredential.cloudApiKey,
    kind: "cloud",
  };

  updateRegisteredBackends((currentBackends) => {
    const sameCredential = currentBackends.find(
      (backend) =>
        backend.kind === "cloud" &&
        normalizeHost(backend.host) === normalizedCredential.host &&
        backend.apiKey.trim() === normalizedCredential.cloudApiKey,
    );

    if (sameCredential) {
      const existing = toStoredCloudBackendCredential(sameCredential);
      if (existing) savedCredential = existing;
      return currentBackends;
    }

    if (currentBackends.some((backend) => backend.id === nextBackend.id)) {
      return currentBackends.map((backend) =>
        backend.id === nextBackend.id ? nextBackend : backend,
      );
    }

    return [...currentBackends, nextBackend];
  });

  return savedCredential;
}

export async function deleteCloudBackendCredential(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  throwIfAborted(options.signal);

  const trimmedId = id.trim();
  if (!trimmedId) return;

  updateRegisteredBackends((currentBackends) =>
    currentBackends.filter((backend) => backend.id !== trimmedId),
  );
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
