import { describe, expect, it } from "vitest";
import {
  applyGroupFolderOrder,
  bucketConversationGroupsByStatus,
  bucketConversationsByStatus,
  deriveRepoFilterOptions,
  filterConversationsByRepo,
  getConversationStatusBucket,
  getGroupConversationPreview,
  groupConversations,
  GROUP_CONVERSATIONS_PREVIEW_LIMIT,
  parseConversationTimeMs,
  moveGroupFolderOrder,
  resolvePinnedConversations,
  sortConversationsByField,
} from "#/components/features/conversation-panel/conversation-panel-list-helpers";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core";

const base: Omit<AppConversation, "id" | "title" | "workspace"> = {
  selected_repository: null,
  selected_branch: null,
  git_provider: null,
  updated_at: "2024-01-02T00:00:00.000Z",
  created_at: "2024-01-01T00:00:00.000Z",
  execution_status: ExecutionStatus.FINISHED,
  conversation_url: null,
  created_by_user_id: null,
  metrics: null,
  llm_model: null,
  trigger: null,
  pr_number: [],
  session_api_key: null,
  sandbox_id: null,
  sub_conversation_ids: [],
};

describe("conversation-panel-list-helpers", () => {
  it("parseConversationTimeMs returns 0 for missing or unparseable timestamps and ms for ISO strings", () => {
    // Three branches in one assertion: missing input (undefined), malformed
    // string (NaN from Date.parse), and a real ISO timestamp.
    expect([
      parseConversationTimeMs(undefined),
      parseConversationTimeMs("not-a-date"),
      parseConversationTimeMs("2024-01-02T00:00:00.000Z"),
    ]).toEqual([0, 0, Date.UTC(2024, 0, 2)]);
  });

  it("sorts by updated desc", () => {
    const a: AppConversation = {
      ...base,
      id: "a",
      title: "a",
      updated_at: "2024-01-01T00:00:00.000Z",
      created_at: "2024-01-01T00:00:00.000Z",
    };
    const b: AppConversation = {
      ...base,
      id: "b",
      title: "b",
      updated_at: "2024-01-03T00:00:00.000Z",
      created_at: "2024-01-01T00:00:00.000Z",
    };
    expect(
      sortConversationsByField([a, b], "updated").map((c) => c.id),
    ).toEqual(["b", "a"]);
  });

  it("sorts by created desc independently of updated", () => {
    // Inverted: the newer `created_at` belongs to the older `updated_at`,
    // so a "created" sort must NOT fall through to `updated_at`.
    const a: AppConversation = {
      ...base,
      id: "a",
      title: "a",
      created_at: "2024-01-05T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };
    const b: AppConversation = {
      ...base,
      id: "b",
      title: "b",
      created_at: "2024-01-02T00:00:00.000Z",
      updated_at: "2024-01-10T00:00:00.000Z",
    };
    expect(
      sortConversationsByField([b, a], "created").map((c) => c.id),
    ).toEqual(["a", "b"]);
  });

  it("normalizes group keys and labels across edge-case inputs", () => {
    // Bundles edge cases the implementation must handle into one assertion
    // so each is covered without proliferating tests:
    //  - workspace paths with trailing slashes are normalized
    //  - whitespace-only `selected_workspace` falls back to "No workspace"
    //  - root-only paths ("/", "///") trim+strip to "" and bucket to the
    //    "no workspace" / "no repository" fallback instead of producing
    //    stray `ws:` / `repo:/` groups
    //  - repository paths ignore trailing slashes (so `org/repo` and
    //    `org/repo/` collapse into the same group)
    //  - repository names ending in `.git` strip the suffix in the label
    //  - missing/invalid timestamps don't break group ordering (they sort
    //    to the bottom rather than throwing)
    const trailingSlash: AppConversation = {
      ...base,
      id: "ws-trailing",
      title: "ws-trailing",
      selected_workspace: "/workspace/agent-server-gui///",
      updated_at: "2024-01-04T00:00:00.000Z",
    };
    const whitespaceOnly: AppConversation = {
      ...base,
      id: "ws-blank",
      title: "ws-blank",
      selected_workspace: "   ",
      updated_at: "2024-01-02T00:00:00.000Z",
    };
    const rootOnly: AppConversation = {
      ...base,
      id: "ws-root",
      title: "ws-root",
      selected_workspace: "/",
      updated_at: "2024-01-03T00:00:00.000Z",
    };
    const localGroups = groupConversations(
      [trailingSlash, whitespaceOnly, rootOnly],
      "local",
      "updated",
      { emptyWorkspace: "No workspace", emptyRepository: "No repository" },
    );
    expect(
      localGroups.map((g) => ({
        id: g.id,
        label: g.label,
        ids: g.conversations.map((c) => c.id),
      })),
    ).toEqual([
      {
        id: "ws:/workspace/agent-server-gui",
        label: "agent-server-gui",
        ids: ["ws-trailing"],
      },
      // Both whitespace-only and "/" collapse into the same fallback
      // bucket — ordered by updated_at desc within the group.
      {
        id: "__none_workspace",
        label: "No workspace",
        ids: ["ws-root", "ws-blank"],
      },
    ]);

    const dotGit: AppConversation = {
      ...base,
      id: "repo-git",
      title: "repo-git",
      selected_repository: "org/canvas.git",
      // Unparseable timestamp — must not throw; falls to 0 ms and sorts last.
      updated_at: "not-a-date",
    };
    const repoTrailingSlash: AppConversation = {
      ...base,
      id: "repo-slash",
      title: "repo-slash",
      // Same logical repo as `dotGit` would be without `.git`; with the
      // trailing-slash normalization both forms must collapse together
      // when they share the same path.
      selected_repository: "org/sdk/",
      updated_at: "2024-01-05T00:00:00.000Z",
    };
    const repoNoSlash: AppConversation = {
      ...base,
      id: "repo-noslash",
      title: "repo-noslash",
      selected_repository: "org/sdk",
      updated_at: "2024-01-06T00:00:00.000Z",
    };
    const blankRepo: AppConversation = {
      ...base,
      id: "repo-blank",
      title: "repo-blank",
      selected_repository: "  ",
      updated_at: "2024-01-04T00:00:00.000Z",
    };
    const rootRepo: AppConversation = {
      ...base,
      id: "repo-root",
      title: "repo-root",
      selected_repository: "/",
      updated_at: "2024-01-03T00:00:00.000Z",
    };
    const cloudGroups = groupConversations(
      [dotGit, repoTrailingSlash, repoNoSlash, blankRepo, rootRepo],
      "cloud",
      "updated",
      { emptyWorkspace: "No workspace", emptyRepository: "No repository" },
    );
    expect(
      cloudGroups.map((g) => ({
        id: g.id,
        label: g.label,
        ids: g.conversations.map((c) => c.id),
      })),
    ).toEqual([
      // `org/sdk` and `org/sdk/` collapse to one group.
      {
        id: "repo:org/sdk",
        label: "sdk",
        ids: ["repo-noslash", "repo-slash"],
      },
      // Whitespace and "/" both bucket into the empty-repo fallback,
      // sorted by updated_at desc within the group.
      {
        id: "__none_repo",
        label: "No repository",
        ids: ["repo-blank", "repo-root"],
      },
      {
        id: "repo:org/canvas.git",
        label: "canvas",
        ids: ["repo-git"],
      },
    ]);
  });

  it("limits grouped folder previews to five conversations with an expand path", () => {
    const conversations = Array.from({ length: 6 }, (_, index) => ({
      ...base,
      id: `c-${index}`,
      title: `Conversation ${index}`,
      updated_at: `2024-01-0${index + 1}T00:00:00.000Z`,
    }));

    const truncated = getGroupConversationPreview(conversations, {
      expanded: false,
    });
    expect(truncated.visibleConversations.map((c) => c.id)).toEqual([
      "c-0",
      "c-1",
      "c-2",
      "c-3",
      "c-4",
    ]);
    expect(truncated.isPreviewTruncated).toBe(true);
    expect(truncated.isShowingAll).toBe(false);

    const expanded = getGroupConversationPreview(conversations, {
      expanded: true,
    });
    expect(expanded.visibleConversations).toHaveLength(6);
    expect(expanded.isPreviewTruncated).toBe(true);
    expect(expanded.isShowingAll).toBe(true);

    const withActiveBeyondPreview = getGroupConversationPreview(conversations, {
      expanded: false,
      activeConversationId: "c-5",
    });
    expect(
      withActiveBeyondPreview.visibleConversations.map((c) => c.id),
    ).toEqual(["c-0", "c-1", "c-2", "c-3", "c-5"]);
    expect(GROUP_CONVERSATIONS_PREVIEW_LIMIT).toBe(5);
  });

  it("resolvePinnedConversations preserves pin order and drops missing ids", () => {
    const conversations = [
      { ...base, id: "a", title: "A" },
      { ...base, id: "b", title: "B" },
      { ...base, id: "c", title: "C" },
    ] as AppConversation[];

    expect(
      resolvePinnedConversations(["c", "missing", "a"], conversations).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["c", "a"]);
  });

  it("derives Conductor-style status buckets from tags and execution status", () => {
    const running: AppConversation = {
      ...base,
      id: "running",
      title: "running",
      execution_status: ExecutionStatus.RUNNING,
    };
    const finished: AppConversation = {
      ...base,
      id: "finished",
      title: "finished",
      execution_status: ExecutionStatus.FINISHED,
    };
    const explicitlyDone: AppConversation = {
      ...base,
      id: "done",
      title: "done",
      execution_status: ExecutionStatus.FINISHED,
      tags: { status: "done" },
    };

    expect(getConversationStatusBucket(running)).toBe("in_progress");
    expect(getConversationStatusBucket(finished)).toBe("in_review");
    expect(getConversationStatusBucket(explicitlyDone)).toBe("done");
    expect(
      bucketConversationsByStatus([finished, explicitlyDone, running]).map(
        (bucket) => ({
          id: bucket.id,
          ids: bucket.conversations.map((conversation) => conversation.id),
        }),
      ),
    ).toEqual([
      { id: "in_progress", ids: ["running"] },
      { id: "in_review", ids: ["finished"] },
      { id: "done", ids: ["done"] },
    ]);
  });

  it("lets a manual status override win over tags and execution status", () => {
    const finished: AppConversation = {
      ...base,
      id: "finished",
      title: "finished",
      execution_status: ExecutionStatus.FINISHED,
    };
    const tagged: AppConversation = {
      ...base,
      id: "tagged",
      title: "tagged",
      execution_status: ExecutionStatus.FINISHED,
      tags: { status: "done" },
    };

    const getOverride = (id: string) =>
      id === "finished"
        ? ("done" as const)
        : id === "tagged"
          ? ("in_progress" as const)
          : undefined;

    // Override beats the FINISHED→in_review fallback...
    expect(getConversationStatusBucket(finished, getOverride)).toBe("done");
    // ...and beats an explicit server tag.
    expect(getConversationStatusBucket(tagged, getOverride)).toBe(
      "in_progress",
    );
    // No override → computed bucket is unchanged.
    expect(getConversationStatusBucket(finished)).toBe("in_review");

    expect(
      bucketConversationsByStatus([finished, tagged], getOverride).map(
        (bucket) => ({
          id: bucket.id,
          ids: bucket.conversations.map((conversation) => conversation.id),
        }),
      ),
    ).toEqual([
      { id: "in_progress", ids: ["tagged"] },
      { id: "done", ids: ["finished"] },
    ]);
  });

  it("derives repo filter options and filters by repo/workspace", () => {
    const a: AppConversation = {
      ...base,
      id: "a",
      title: "a",
      selected_workspace: "/projects/spotwise-ui",
    };
    const b: AppConversation = {
      ...base,
      id: "b",
      title: "b",
      selected_workspace: "/projects/spotwise-ui",
    };
    const c: AppConversation = {
      ...base,
      id: "c",
      title: "c",
      selected_workspace: "/projects/internal-spotty",
    };
    const labels = {
      emptyWorkspace: "No workspace",
      emptyRepository: "No repo",
    };

    const options = deriveRepoFilterOptions([a, b, c], "local", labels);
    expect(
      options
        .map((option) => ({ id: option.id, count: option.count }))
        .sort((x, y) => x.id.localeCompare(y.id)),
    ).toEqual([
      { id: "ws:/projects/internal-spotty", count: 1 },
      { id: "ws:/projects/spotwise-ui", count: 2 },
    ]);

    expect(
      filterConversationsByRepo(
        [a, b, c],
        "local",
        "ws:/projects/spotwise-ui",
      ).map((conversation) => conversation.id),
    ).toEqual(["a", "b"]);

    expect(
      filterConversationsByRepo([a, b, c], "local", "all").map(
        (conversation) => conversation.id,
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("places a workspace group in the highest-priority status it contains", () => {
    const running: AppConversation = {
      ...base,
      id: "running",
      title: "running",
      execution_status: ExecutionStatus.RUNNING,
      selected_workspace: "/projects/app",
    };
    const finished: AppConversation = {
      ...base,
      id: "finished",
      title: "finished",
      execution_status: ExecutionStatus.FINISHED,
      selected_workspace: "/projects/app",
    };
    const done: AppConversation = {
      ...base,
      id: "done",
      title: "done",
      execution_status: ExecutionStatus.FINISHED,
      tags: { status: "done" },
      selected_workspace: "/projects/docs",
    };
    const groups = groupConversations(
      [finished, done, running],
      "local",
      "updated",
      { emptyWorkspace: "No workspace", emptyRepository: "No repository" },
    );

    expect(
      bucketConversationGroupsByStatus(groups).map((bucket) => ({
        id: bucket.id,
        groupIds: bucket.groups.map((group) => group.id),
      })),
    ).toEqual([
      { id: "in_progress", groupIds: ["ws:/projects/app"] },
      { id: "done", groupIds: ["ws:/projects/docs"] },
    ]);
  });

  it("groups local conversations by selected_workspace, collapsing per-conversation worktree paths", () => {
    // Two worktree-mode conversations launched against the same workspace must
    // end up in a single group keyed off the user-selected workspace, not split
    // by the runtime worktree dir.
    const sameWsA: AppConversation = {
      ...base,
      id: "1",
      title: "one",
      selected_workspace: "/projects/spotwise-self-serve-web",
      workspace: {
        working_dir: "/tmp/conversation-worktrees/1/spotwise-self-serve-web",
      },
      updated_at: "2024-01-02T00:00:00.000Z",
    };
    const sameWsB: AppConversation = {
      ...base,
      id: "2",
      title: "two",
      selected_workspace: "/projects/spotwise-self-serve-web",
      workspace: {
        working_dir: "/tmp/conversation-worktrees/2/spotwise-self-serve-web",
      },
      updated_at: "2024-01-04T00:00:00.000Z",
    };
    // Different workspace — its own group.
    const otherWs: AppConversation = {
      ...base,
      id: "3",
      title: "three",
      selected_workspace: "/projects/other",
      workspace: { working_dir: "/tmp/conversation-worktrees/3/other" },
      updated_at: "2024-01-03T00:00:00.000Z",
    };
    // No user-selected workspace — must bucket under "No workspace"
    // even though working_dir is set (to a per-conversation default).
    const none: AppConversation = {
      ...base,
      id: "4",
      title: "four",
      selected_workspace: null,
      workspace: { working_dir: "/workspace/project/agent-canvas/wt-noop" },
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const groups = groupConversations(
      [sameWsA, sameWsB, otherWs, none],
      "local",
      "updated",
      { emptyWorkspace: "No workspace", emptyRepository: "No repository" },
    );

    expect(
      groups.map((g) => ({
        id: g.id,
        label: g.label,
        ids: g.conversations.map((c) => c.id),
        launch: g.launch,
      })),
    ).toEqual([
      {
        id: "ws:/projects/spotwise-self-serve-web",
        label: "spotwise-self-serve-web",
        ids: ["2", "1"],
        launch: { workingDir: "/projects/spotwise-self-serve-web" },
      },
      {
        id: "ws:/projects/other",
        label: "other",
        ids: ["3"],
        launch: { workingDir: "/projects/other" },
      },
      {
        id: "__none_workspace",
        label: "No workspace",
        ids: ["4"],
        launch: {},
      },
    ]);
  });

  it("groups cloud conversations by repository string", () => {
    const r1: AppConversation = {
      ...base,
      id: "1",
      title: "one",
      selected_repository: "org/agent-canvas",
      updated_at: "2024-01-02T00:00:00.000Z",
    };
    const r2: AppConversation = {
      ...base,
      id: "2",
      title: "two",
      selected_repository: "org/sdk",
      updated_at: "2024-01-03T00:00:00.000Z",
    };

    const groups = groupConversations([r1, r2], "cloud", "updated", {
      emptyWorkspace: "No workspace",
      emptyRepository: "No repository",
    });

    expect(groups.map((g) => g.label)).toEqual(["sdk", "agent-canvas"]);
    expect(groups[0].launch).toEqual({
      repository: {
        name: "org/sdk",
        gitProvider: "github",
        branch: "main",
      },
    });
    expect(groups[1].launch).toEqual({
      repository: {
        name: "org/agent-canvas",
        gitProvider: "github",
        branch: "main",
      },
    });
  });

  it("applies a persisted folder order and moves folders via drag-and-drop", () => {
    const groups = [
      { id: "ws:/workspace/alpha", label: "alpha" },
      { id: "ws:/workspace/beta", label: "beta" },
      { id: "ws:/workspace/gamma", label: "gamma" },
    ];

    expect(
      applyGroupFolderOrder(groups, [
        "ws:/workspace/gamma",
        "ws:/workspace/alpha",
      ]).map((group) => group.id),
    ).toEqual([
      "ws:/workspace/gamma",
      "ws:/workspace/alpha",
      "ws:/workspace/beta",
    ]);

    expect(
      moveGroupFolderOrder(
        ["ws:/workspace/gamma", "ws:/workspace/alpha"],
        groups.map((group) => group.id),
        "ws:/workspace/alpha",
        "ws:/workspace/beta",
      ),
    ).toEqual([
      "ws:/workspace/gamma",
      "ws:/workspace/beta",
      "ws:/workspace/alpha",
    ]);
  });
});
