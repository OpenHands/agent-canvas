import { delay, http, HttpResponse } from "msw";

export const FILE_VARIANTS_1 = ["file1.txt", "file2.txt", "file3.txt"];
export const FILE_VARIANTS_2 = [
  "reboot_skynet.exe",
  "target_list.txt",
  "terminator_blueprint.txt",
];

const MOCK_DIRECTORY_CHILDREN: Record<
  string,
  { name: string; path: string }[]
> = {
  "/": [{ name: "projects", path: "/projects" }],
  "/projects": [
    { name: "agent-canvas", path: "/projects/agent-canvas" },
    { name: "demo-workspace", path: "/projects/demo-workspace" },
  ],
  "/projects/agent-canvas": [],
  "/projects/demo-workspace": [],
};

export const FILE_SERVICE_HANDLERS = [
  http.get("*/api/file/home", async () => {
    await delay();

    return HttpResponse.json({
      home: "/projects",
      favorites: [{ label: "Projects", path: "/projects" }],
      locations: [{ label: "Root", path: "/" }],
    });
  }),

  http.get("*/api/file/search_subdirs", async ({ request }) => {
    await delay();

    const url = new URL(request.url);
    const requestedPath = url.searchParams.get("path") || "/";
    const normalizedPath =
      requestedPath.length > 1
        ? requestedPath.replace(/[\\/]+$/, "")
        : requestedPath;

    return HttpResponse.json({
      items: MOCK_DIRECTORY_CHILDREN[normalizedPath] ?? [],
      next_page_id: null,
    });
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
