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

export async function getSetupStatus(): Promise<SetupStatus> {
  const res = await fetch(`${getBaseUrl()}/setup/status`);
  if (!res.ok) throw new Error(`Setup status failed: ${res.status}`);
  return res.json();
}

export async function startDockerBackend(
  projectPath: string,
): Promise<DockerStartResult> {
  const res = await fetch(`${getBaseUrl()}/setup/docker`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as DockerStartError).error);
  return data as DockerStartResult;
}

export async function stopDockerBackend(): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/setup/docker`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Stop Docker failed: ${res.status}`);
}
