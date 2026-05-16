import { http, delay, HttpResponse } from "msw";
import type { DirectConversationInfo } from "#/api/agent-server-adapter";
import { GetMicroagentsResponse } from "#/api/open-hands.types";

// ---------------------------------------------------------------------------
// Trajectory fixtures
// ---------------------------------------------------------------------------

/**
 * A minimal "echo hello world" trajectory shared by the archived (conv 4)
 * and sandbox-error (conv 5) mock conversations so snapshot tests render
 * real chat history above the read-only banner.
 *
 * The events/search endpoint is requested with sort_order=TIMESTAMP_DESC, so
 * the items are ordered newest-first here; useConversationHistory reverses
 * them back to chronological order before storing them in the event store.
 */
const ECHO_HELLO_WORLD_TRAJECTORY = [
  // 3 — bash observation (newest)
  {
    id: "archived-evt-3",
    timestamp: "2026-01-10T00:00:03.000Z",
    source: "environment",
    action_id: "archived-evt-2",
    tool_name: "execute_bash",
    tool_call_id: "call-archived-bash-1",
    observation: {
      kind: "ExecuteBashObservation",
      output: "hello world",
      command: "echo hello world",
      exit_code: 0,
      error: false,
      timed_out: false,
      metadata: {},
    },
  },
  // 2 — agent bash action
  {
    id: "archived-evt-2",
    timestamp: "2026-01-10T00:00:02.000Z",
    source: "agent",
    thought: [
      { type: "text", text: "I'll run the echo command as requested." },
    ],
    reasoning_content: null,
    thinking_blocks: [],
    action: {
      kind: "ExecuteBashAction",
      command: "echo hello world",
      is_input: false,
      timeout: null,
      reset: false,
    },
    tool_name: "execute_bash",
    tool_call_id: "call-archived-bash-1",
    tool_call: {
      id: "call-archived-bash-1",
      type: "function",
      function: {
        name: "execute_bash",
        arguments: JSON.stringify({ command: "echo hello world" }),
      },
    },
    llm_response_id: "archived-response-1",
    security_risk: "unknown",
  },
  // 1 — user message (oldest)
  {
    id: "archived-evt-1",
    timestamp: "2026-01-10T00:00:01.000Z",
    source: "user",
    llm_message: {
      role: "user",
      content: [{ type: "text", text: "echo hello world" }],
    },
    activated_microagents: [],
    extended_content: [],
  },
];

/** Map from conversation id → events returned by GET /events/search */
const CONVERSATION_EVENTS: Record<string, unknown[]> = {
  "4": ECHO_HELLO_WORLD_TRAJECTORY,
  "5": ECHO_HELLO_WORLD_TRAJECTORY,
};

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
  // Conversation whose sandbox has been removed (MISSING). The conversation
  // history is still readable but the sandbox cannot be resumed — the chat
  // input is replaced with a read-only archived banner.
  {
    id: "4",
    title: "Archived Project",
    created_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
    execution_status: "idle",
    sandbox_status: "MISSING",
  },
  // Conversation whose sandbox encountered an unrecoverable error. Same
  // read-only treatment but with the "Sandbox error" variant of the banner.
  {
    id: "5",
    title: "Errored Project",
    created_at: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    execution_status: "idle",
    sandbox_status: "ERROR",
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
    sandbox_status: conversation.sandbox_status ?? null,
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
  http.get("*/api/conversations/search", async ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const items = Array.from(CONVERSATIONS.values())
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit)
      .map(createConversationResponse);

    return HttpResponse.json({ items, next_page_id: null });
  }),

  http.get("*/api/conversations", async ({ request }) => {
    const url = new URL(request.url);
    // Axios serializes arrays as `ids[]=a&ids[]=b` (bracket notation).
    // Fall back to plain `ids` to support both formats.
    const ids =
      url.searchParams.getAll("ids[]").length > 0
        ? url.searchParams.getAll("ids[]")
        : url.searchParams.getAll("ids");
    return HttpResponse.json(listConversationResponses(ids));
  }),

  http.get("*/api/conversations/:conversationId", async ({ params }) => {
    const conversationId = params.conversationId as string;
    const conversation = CONVERSATIONS.get(conversationId);
    if (conversation) {
      return HttpResponse.json(createConversationResponse(conversation));
    }
    return HttpResponse.json(null, { status: 404 });
  }),

  http.post("*/api/conversations", async () => {
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

  http.delete("*/api/conversations/:conversationId", async ({ params }) => {
    const conversationId = params.conversationId as string;
    if (CONVERSATIONS.has(conversationId)) {
      CONVERSATIONS.delete(conversationId);
      return HttpResponse.json(null, { status: 200 });
    }
    return HttpResponse.json(null, { status: 404 });
  }),

  http.get("*/api/conversations/:conversationId/events/count", async () =>
    HttpResponse.json(0),
  ),

  http.get(
    "*/api/conversations/:conversationId/events/search",
    async ({ params }) => {
      const conversationId = params.conversationId as string;
      const items = CONVERSATION_EVENTS[conversationId] ?? [];
      return HttpResponse.json({ items, next_page_id: null });
    },
  ),

  http.post("*/api/conversations/:conversationId/events", async () =>
    HttpResponse.json({ ok: true }),
  ),

  http.post("*/api/conversations/:conversationId/pause", async () =>
    HttpResponse.json({ success: true }),
  ),

  http.post("*/api/conversations/:conversationId/run", async () =>
    HttpResponse.json({ success: true }),
  ),

  http.post("*/api/conversations/:conversationId/ask_agent", async () =>
    HttpResponse.json({ response: "Mock agent response" }),
  ),

  http.get("*/api/vscode/url", async () => HttpResponse.json({ url: null })),

  http.post("*/api/skills", async () => HttpResponse.json({ skills: [] })),

  http.post(
    "/api/v1/conversations/:conversationId/pending-messages",
    async () => HttpResponse.json({ id: "mock-pending-id", position: 0 }),
  ),

  http.get("*/api/conversations/:conversationId/microagents", async () => {
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
