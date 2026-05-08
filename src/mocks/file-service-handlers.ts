import { delay, http, HttpResponse } from "msw";
import type {
  SubdirectoryEntry,
  SubdirectoryPage,
} from "#/api/files-service/files-service.api";

export const FILE_VARIANTS_1 = ["file1.txt", "file2.txt", "file3.txt"];
export const FILE_VARIANTS_2 = [
  "reboot_skynet.exe",
  "target_list.txt",
  "terminator_blueprint.txt",
];

const MOCK_HOME = "/Users/demo";

const MOCK_SUBDIRECTORIES: Record<string, SubdirectoryEntry[]> = {
  [MOCK_HOME]: [
    { name: "Desktop", path: `${MOCK_HOME}/Desktop` },
    { name: "Documents", path: `${MOCK_HOME}/Documents` },
    { name: "Downloads", path: `${MOCK_HOME}/Downloads` },
    { name: "Projects", path: `${MOCK_HOME}/Projects` },
  ],
  [`${MOCK_HOME}/Projects`]: [
    { name: "OpenHands", path: `${MOCK_HOME}/Projects/OpenHands` },
    { name: "playground", path: `${MOCK_HOME}/Projects/playground` },
  ],
  [`${MOCK_HOME}/Projects/OpenHands`]: [
    {
      name: "agent-canvas",
      path: `${MOCK_HOME}/Projects/OpenHands/agent-canvas`,
    },
    {
      name: "software-agent-sdk",
      path: `${MOCK_HOME}/Projects/OpenHands/software-agent-sdk`,
    },
  ],
  [`${MOCK_HOME}/Downloads`]: [
    {
      name: "meeting-artifacts",
      path: `${MOCK_HOME}/Downloads/meeting-artifacts`,
    },
  ],
  "/": [{ name: "Users", path: "/Users" }],
  "/Users": [{ name: "demo", path: MOCK_HOME }],
};

export const FILE_SERVICE_HANDLERS = [
  http.get("/api/file/home", async () =>
    HttpResponse.json({ home: MOCK_HOME }),
  ),

  http.get("/api/file/search_subdirs", async ({ request }) => {
    const url = new URL(request.url);
    const path = url.searchParams.get("path") ?? MOCK_HOME;
    const items = MOCK_SUBDIRECTORIES[path] ?? [];
    const response: SubdirectoryPage = {
      items,
      next_page_id: null,
    };

    return HttpResponse.json(response);
  }),

  http.get(
    "/api/conversations/:conversationId/list-files",
    async ({ params }) => {
      await delay();

      const cid = params.conversationId?.toString();
      if (!cid) return HttpResponse.json(null, { status: 400 });

      return cid === "test-conversation-id-2"
        ? HttpResponse.json(FILE_VARIANTS_2)
        : HttpResponse.json(FILE_VARIANTS_1);
    },
  ),

  http.get(
    "/api/conversations/:conversationId/select-file",
    async ({ request }) => {
      await delay();

      const url = new URL(request.url);
      const file = url.searchParams.get("file")?.toString();
      if (file) {
        return HttpResponse.json({ code: `Content of ${file}` });
      }

      return HttpResponse.json(null, { status: 404 });
    },
  ),
];
