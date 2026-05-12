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
});
