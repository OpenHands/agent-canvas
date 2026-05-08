import { describe, expect, it } from "vitest";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import AgentServerGitService from "#/api/git-service/agent-server-git-service.api";

describe("mock conversation handlers", () => {
  it("returns adapted conversations for batch lookups", async () => {
    const [conversation] = await AgentServerConversationService.batchGetAppConversations([
      "1",
    ]);

    expect(conversation?.id).toBe("1");
    expect(conversation?.title).toBe("My New Project");
    expect(conversation?.conversation_url).toContain("/api/conversations/1");
    expect(conversation?.workspace?.working_dir).toBe("workspace/project");
  });

  it("returns adapted conversation pages for search", async () => {
    const page = await AgentServerConversationService.searchConversations(10);

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.next_page_id).toBeNull();
    expect(page.items[0]?.title).toBeTruthy();
  });

  it("returns empty git changes for mock conversations", async () => {
    const changes = await AgentServerGitService.getGitChanges(
      "http://localhost:3000/api/conversations/1",
      null,
      "workspace/project",
    );

    expect(changes).toEqual([]);
  });
});
