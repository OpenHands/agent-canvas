import { SkillsClient } from "@openhands/typescript-client/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import SkillsService from "#/api/skills-service";

const { mockGetSkills } = vi.hoisted(() => ({
  mockGetSkills: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  SkillsClient: vi.fn(function SkillsClientMock() {
    return { getSkills: mockGetSkills };
  }),
}));

const localBackend: Backend = {
  id: "local",
  name: "Local",
  host: "http://127.0.0.1:8000",
  apiKey: "",
  kind: "local",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([localBackend]);
  setActiveSelection({ backendId: localBackend.id });
  mockGetSkills.mockReset();
  vi.mocked(SkillsClient).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetActiveStoreForTests();
});

describe("SkillsService.getSkills against the agent-server backend", () => {
  it("requests load_public:true for the global Skills page even when VITE_LOAD_PUBLIC_SKILLS is unset, so a fresh dev env still shows the public catalog", async () => {
    // Arrange: the dev-default scenario that shipped the empty Skills page —
    // VITE_LOAD_PUBLIC_SKILLS is not set, so shouldLoadPublicSkills() would
    // return false. The agent-server has one public skill it can return.
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "");
    mockGetSkills.mockResolvedValue({
      skills: [
        {
          name: "alpha",
          type: "knowledge",
          content: "...",
          triggers: [],
          source: "public",
          is_agentskills_format: false,
        },
      ],
      sources: { sandbox: 0, sdk_base: 1, org: 0, project: 0 },
    });

    // Act
    const skills = await SkillsService.getSkills();

    // Assert: the request opts the user into public skills regardless of the
    // perf-oriented VITE_LOAD_PUBLIC_SKILLS gate, and the page receives them.
    expect(mockGetSkills).toHaveBeenCalledTimes(1);
    expect(mockGetSkills.mock.calls[0]?.[0]).toMatchObject({
      load_public: true,
      load_user: true,
      load_project: true,
      load_org: false,
    });
    expect(skills.map((s) => s.name)).toEqual(["alpha"]);
  });

  it("forwards an explicit project_dir so conversation views can scope the catalog to their own workspace", async () => {
    mockGetSkills.mockResolvedValue({ skills: [], sources: {} });

    await SkillsService.getSkills("/home/user/my-repo");

    expect(mockGetSkills.mock.calls[0]?.[0]).toMatchObject({
      load_public: true,
      load_user: true,
      load_project: true,
      project_dir: "/home/user/my-repo",
    });
  });
});

describe("SkillsService.getProjectSkills", () => {
  it("requests only project skills and rebuilds Skill payloads from SkillInfo", async () => {
    // Two project skills: a repo skill (no triggers → always active) and a
    // legacy knowledge skill (triggers → KeywordTrigger).
    mockGetSkills.mockResolvedValue({
      skills: [
        {
          name: "custom-codereview-guide",
          type: "repo",
          content: "review carefully",
          triggers: [],
          source: "/workspace/project/agent-canvas/.agents/skills/x.md",
          description: "repo guide",
          is_agentskills_format: false,
          disable_model_invocation: false,
        },
        {
          name: "knowledge-skill",
          type: "knowledge",
          content: "knowledge body",
          triggers: ["deploy", "release"],
          source: "user",
          is_agentskills_format: false,
        },
      ],
      sources: { sandbox: 0, sdk_base: 0, org: 0, project: 2 },
    });

    const skills = await SkillsService.getProjectSkills(
      "/workspace/project/agent-canvas",
    );

    // Only project skills are requested — public/user are already auto-loaded
    // server-side via load_*_skills on the agent_context. The conversation's
    // working dir is threaded through as project_dir.
    expect(mockGetSkills.mock.calls[0]?.[0]).toMatchObject({
      load_public: false,
      load_user: false,
      load_project: true,
      load_org: false,
      project_dir: "/workspace/project/agent-canvas",
    });

    expect(skills).toEqual([
      {
        name: "custom-codereview-guide",
        content: "review carefully",
        source: "/workspace/project/agent-canvas/.agents/skills/x.md",
        description: "repo guide",
        is_agentskills_format: false,
        disable_model_invocation: false,
      },
      {
        name: "knowledge-skill",
        content: "knowledge body",
        source: "user",
        description: null,
        is_agentskills_format: false,
        disable_model_invocation: false,
        trigger: { type: "keyword", keywords: ["deploy", "release"] },
      },
    ]);
  });

  it("rebuilds a TaskTrigger for AgentSkills-format skills with triggers", async () => {
    mockGetSkills.mockResolvedValue({
      skills: [
        {
          name: "task-skill",
          type: "agentskills",
          content: "task body",
          triggers: ["/task-skill"],
          source: "project",
          is_agentskills_format: true,
        },
      ],
      sources: { project: 1 },
    });

    const [skill] = await SkillsService.getProjectSkills();

    expect(skill.trigger).toEqual({ type: "task", triggers: ["/task-skill"] });
    expect(skill.is_agentskills_format).toBe(true);
  });

  it("returns [] for cloud backends without calling the skills client", async () => {
    setRegisteredBackends([
      {
        id: "cloud",
        name: "Cloud",
        host: "https://app",
        apiKey: "",
        kind: "cloud",
      },
    ]);
    setActiveSelection({ backendId: "cloud" });

    const skills = await SkillsService.getProjectSkills();

    expect(skills).toEqual([]);
    expect(mockGetSkills).not.toHaveBeenCalled();
  });

  it("returns [] when loading project skills fails so conversation start is not blocked", async () => {
    mockGetSkills.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const skills = await SkillsService.getProjectSkills();

    expect(skills).toEqual([]);
  });
});
