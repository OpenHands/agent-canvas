import { http, delay, HttpResponse } from "msw";
import type { DirectConversationInfo } from "#/api/agent-server-adapter";
import { GetMicroagentsResponse } from "#/api/open-hands.types";

const now = Date.now();

type MockConversation = DirectConversationInfo & {
  selected_repository?: string | null;
  selected_branch?: string | null;
  git_provider?: string | null;
};

const conversations: MockConversation[] = [
  {
    id: "1",
    title: "My New Project",
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    execution_status: "waiting_for_confirmation",
  },
  {
    id: "2",
    title: "Repo Testing",
    created_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    execution_status: "idle",
    selected_repository: "octocat/hello-world",
    git_provider: "github",
  },
  {
    id: "3",
    title: "Another Project",
    created_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
    execution_status: "idle",
    selected_repository: "octocat/earth",
    selected_branch: "main",
  },
];

const CONVERSATIONS = new Map<string, MockConversation>(
  conversations.map((conversation) => [conversation.id, conversation]),
);

function createConversationResponse(
  conversation: MockConversation,
): DirectConversationInfo {
  return {
    id: conversation.id,
    title: conversation.title ?? null,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    execution_status: conversation.execution_status ?? "idle",
    metrics: conversation.metrics ?? null,
    agent: conversation.agent ?? null,
    workspace: conversation.workspace ?? null,
  };
}

function listConversationResponses(ids?: string[] | null) {
  if (!ids || ids.length === 0) {
    return Array.from(CONVERSATIONS.values()).map(createConversationResponse);
  }

  return ids.map((id) => {
    const conversation = CONVERSATIONS.get(id);
    return conversation ? createConversationResponse(conversation) : null;
  });
}

export const CONVERSATION_HANDLERS = [
  http.get("/api/conversations/search", async ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const items = Array.from(CONVERSATIONS.values())
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit)
      .map(createConversationResponse);

    return HttpResponse.json({ items, next_page_id: null });
  }),

  http.get("/api/conversations", async ({ request }) => {
    const url = new URL(request.url);
    const ids = url.searchParams.getAll("ids");
    return HttpResponse.json(listConversationResponses(ids));
  }),

  http.get("/api/conversations/:conversationId", async ({ params }) => {
    const conversationId = params.conversationId as string;
    const conversation = CONVERSATIONS.get(conversationId);
    if (conversation) {
      return HttpResponse.json(createConversationResponse(conversation));
    }
    return HttpResponse.json(null, { status: 404 });
  }),

  http.post("/api/conversations", async () => {
    await delay();
    const conversation: MockConversation = {
      id: `${Math.floor(Math.random() * 100000)}`,
      title: "New Conversation",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_status: "idle",
    };
    CONVERSATIONS.set(conversation.id, conversation);
    return HttpResponse.json(createConversationResponse(conversation), {
      status: 201,
    });
  }),

  http.patch(
    "/api/conversations/:conversationId",
    async ({ params, request }) => {
      const conversationId = params.conversationId as string;
      const conversation = CONVERSATIONS.get(conversationId);

      if (conversation) {
        const body = (await request.json()) as { title?: string } | null;
        if (body?.title) {
          CONVERSATIONS.set(conversationId, {
            ...conversation,
            title: body.title,
            updated_at: new Date().toISOString(),
          });
          return HttpResponse.json(null, { status: 200 });
        }
      }
      return HttpResponse.json(null, { status: 404 });
    },
  ),

  http.delete("/api/conversations/:conversationId", async ({ params }) => {
    const conversationId = params.conversationId as string;
    if (CONVERSATIONS.has(conversationId)) {
      CONVERSATIONS.delete(conversationId);
      return HttpResponse.json(null, { status: 200 });
    }
    return HttpResponse.json(null, { status: 404 });
  }),

  http.get("/api/conversations/:conversationId/events/count", async () =>
    HttpResponse.json(0),
  ),

  http.get("/api/conversations/:conversationId/events/search", async () =>
    HttpResponse.json({ items: [] }),
  ),

  http.post("/api/conversations/:conversationId/events", async () =>
    HttpResponse.json({ ok: true }),
  ),

  http.post("/api/conversations/:conversationId/pause", async () =>
    HttpResponse.json({ success: true }),
  ),

  http.post("/api/conversations/:conversationId/run", async () =>
    HttpResponse.json({ success: true }),
  ),

  http.post("/api/conversations/:conversationId/ask_agent", async () =>
    HttpResponse.json({ response: "Mock agent response" }),
  ),

  http.get("/api/vscode/url", async () => HttpResponse.json({ url: null })),

  http.post("/api/skills", async () => HttpResponse.json({ skills: [] })),

  http.post(
    "/api/v1/conversations/:conversationId/pending-messages",
    async () => HttpResponse.json({ id: "mock-pending-id", position: 0 }),
  ),

  http.get("/api/conversations/:conversationId/microagents", async () => {
    const response: GetMicroagentsResponse = {
      microagents: [
        {
          name: "init",
          type: "agentskills",
          content: "Initialize an AGENTS.md file for the repository",
          triggers: ["/init"],
        },
        {
          name: "releasenotes",
          type: "agentskills",
          content: "Generate a changelog from the most recent release",
          triggers: ["/releasenotes"],
        },
        {
          name: "test-runner",
          type: "agentskills",
          content: "Run the test suite and report results",
          triggers: ["/test"],
        },
        {
          name: "code-search",
          type: "knowledge",
          content: "Search the codebase semantically",
          triggers: ["/search"],
        },
        {
          name: "docker",
          type: "agentskills",
          content: "Docker usage guide for container environments",
          triggers: ["docker", "container"],
        },
        {
          name: "github",
          type: "agentskills",
          content: "GitHub API interaction guide",
          triggers: ["github", "git"],
        },
        {
          name: "work_hosts",
          type: "repo",
          content: "Available hosts for web applications",
          triggers: [],
        },
      ],
    };
    return HttpResponse.json(response);
  }),
];
