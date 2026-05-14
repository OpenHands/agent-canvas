import { delay, http, HttpResponse } from "msw";

export const FILE_VARIANTS_1 = ["file1.txt", "file2.txt", "file3.txt"];
export const FILE_VARIANTS_2 = [
  "reboot_skynet.exe",
  "target_list.txt",
  "terminator_blueprint.txt",
];

export const FILE_SERVICE_HANDLERS = [
  http.all("*/api/bash/execute_bash_command", async () =>
    HttpResponse.json({
      command: "",
      exit_code: 0,
      output: "",
    }),
  ),

  http.get("*/api/file/search_subdirs", async () =>
    HttpResponse.json({ path: "/projects", subdirs: [] }),
  ),

  http.get("*/api/file/:path", async ({ params }) =>
    HttpResponse.json({
      path: `/${params.path?.toString() ?? "home"}`,
      subdirs: [],
    }),
  ),

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
