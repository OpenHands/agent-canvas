import { http, HttpResponse, delay } from "msw";
import type { WorkManifest } from "#/types/work-manifest";

let manifest: WorkManifest = {
  id: "work-default",
  name: "Default Work Workspace",
  grantedFolders: [],
  deliverablesPath: "",
  defaultOptionalTools: [],
};

export const resetWorkRuntimeMockData = () => {
  manifest = {
    id: "work-default",
    name: "Default Work Workspace",
    grantedFolders: [],
    deliverablesPath: "",
    defaultOptionalTools: [],
  };
};

export const WORK_RUNTIME_HANDLERS = [
  http.get("*/api/work/health", async () => {
    await delay(50);
    return HttpResponse.json({ status: "ok" });
  }),

  http.get("*/api/work/manifest", async () => {
    await delay(50);
    return HttpResponse.json(manifest);
  }),

  http.put("*/api/work/manifest", async ({ request }) => {
    await delay(50);
    manifest = (await request.json()) as WorkManifest;
    return HttpResponse.json(manifest);
  }),

  http.post("*/api/work/manifest/validate-paths", async ({ request }) => {
    await delay(50);
    const body = (await request.json()) as { paths?: string[] };
    const paths = body.paths ?? [];
    return HttpResponse.json({
      results: paths.map((path) => ({
        path,
        exists: path.startsWith("/"),
      })),
    });
  }),
];
