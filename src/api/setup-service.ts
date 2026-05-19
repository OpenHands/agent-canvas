/**
 * Client for the mini setup server that manages Docker lifecycle.
 *
 * The setup server runs alongside the dev stack on the ingress proxy
 * at /setup/*. It lets the browser frontend check Docker availability
 * and start/stop Docker backend containers.
 */

export interface SetupStatus {
  dockerInstalled: boolean;
  dockerRunning: boolean;
  dockerBackendRunning: boolean;
  dockerBackendPort: number;
  dockerBackendUrl?: string;
  projectPath?: string | null;
}

export interface DockerStartResult {
  status: string;
  host: string;
  port: number;
  url: string;
}

export interface DockerStartError {
  error: string;
  installUrl?: string;
}

function getBaseUrl(): string {
  // The setup server is routed through the ingress proxy
  return window.location.origin;
}

async function fetchSetupJson<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = (data as Partial<DockerStartError>).error;
      throw new Error(error || `HTTP ${res.status}`);
    }

    return data as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return fetchSetupJson<SetupStatus>("/setup/status");
}

export async function startDockerBackend(
  projectPath: string,
): Promise<DockerStartResult> {
  return fetchSetupJson<DockerStartResult>(
    "/setup/docker",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath }),
    },
    60_000,
  );
}

export async function stopDockerBackend(): Promise<void> {
  await fetchSetupJson<{ status: string }>("/setup/docker", {
    method: "DELETE",
  });
}
