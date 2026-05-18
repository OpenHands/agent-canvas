import { http, HttpResponse } from "msw";

let dockerBackendRunning = false;
let dockerProjectPath: string | null = null;

export const resetSetupMockData = () => {
  dockerBackendRunning = false;
  dockerProjectPath = null;
};

export const SETUP_HANDLERS = [
  http.get("*/setup/status", async () =>
    HttpResponse.json({
      dockerInstalled: true,
      dockerRunning: true,
      dockerBackendRunning,
      dockerBackendPort: 18002,
      dockerBackendUrl: "http://127.0.0.1:18002",
      projectPath: dockerProjectPath,
    }),
  ),

  http.post("*/setup/docker", async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      projectPath?: string;
    } | null;

    if (!body?.projectPath) {
      return HttpResponse.json(
        { error: "projectPath is required" },
        { status: 400 },
      );
    }

    dockerBackendRunning = true;
    dockerProjectPath = body.projectPath;

    return HttpResponse.json({
      status: "starting",
      host: "http://127.0.0.1",
      port: 18002,
      url: "http://127.0.0.1:18002",
    });
  }),

  http.delete("*/setup/docker", async () => {
    dockerBackendRunning = false;
    dockerProjectPath = null;
    return HttpResponse.json({ status: "stopped" });
  }),
];
