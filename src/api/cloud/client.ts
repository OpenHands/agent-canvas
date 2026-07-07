import { CloudClient } from "@openhands/typescript-client/clients";
import {
  getAgentServerBaseUrl,
  getAgentServerHeaders,
} from "../agent-server-config";
import { NoBackendAvailableError } from "../agent-server-client-options";
import { getActiveBackend } from "../backend-registry/active-store";
import type { Backend } from "../backend-registry/types";

function requireCloudBackend(backend?: Backend): Backend {
  if (backend) return backend;
  const active = getActiveBackend().backend;
  if (active.kind !== "cloud") {
    throw new Error("Cloud calls require a cloud backend.");
  }
  return active;
}

function activeOrgForBackend(backend: Backend): string | null {
  const active = getActiveBackend();
  return active.backend.id === backend.id ? active.orgId : null;
}

export function createCloudClient(backend?: Backend): CloudClient {
  const target = requireCloudBackend(backend);
  const proxyBaseUrl = getAgentServerBaseUrl();
  const proxyHeaders = proxyBaseUrl ? getAgentServerHeaders() : {};

  return new CloudClient({
    host: target.host,
    apiKey: target.apiKey,
    orgId: activeOrgForBackend(target),
    ...(proxyBaseUrl
      ? {
          proxy: {
            host: proxyBaseUrl,
            headers: proxyHeaders,
          },
        }
      : {}),
  });
}

export function createCloudClientForRuntime(backend?: Backend): CloudClient {
  const client = createCloudClient(backend);
  if (!client.proxy) {
    throw new NoBackendAvailableError();
  }
  return client;
}
