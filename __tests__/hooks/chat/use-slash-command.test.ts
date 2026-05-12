import React from "react";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSlashCommand } from "#/hooks/chat/use-slash-command";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";

const mockSkills = vi.hoisted(() => ({
  data: undefined as unknown[] | undefined,
  isLoading: false,
}));

const mockConversation = vi.hoisted(() => ({
  data: undefined as { conversation_version?: "V0" | "V1" } | undefined,
}));

vi.mock("#/hooks/query/use-skills", () => ({
  useSkills: () => mockSkills,
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => mockConversation,
}));

function makeSkill(
  name: string,
  triggers: string[] = [],
  type: "agentskills" | "knowledge" = "agentskills",
) {
  return { name, type, content: `Description of ${name}`, triggers };
}

function makeChatInputRef() {
  return { current: document.createElement("div") };
}

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

describe("useSlashCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkills.data = undefined;
    mockSkills.isLoading = false;
    mockConversation.data = undefined;
  });

  afterEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  it("excludes /new from the built-in commands on a local backend", () => {
    // Arrange — default active backend is the bundled local one.
    mockConversation.data = { conversation_version: "V1" };
    mockSkills.data = [makeSkill("code-search", ["/code-search"])];

    // Act
    const ref = makeChatInputRef();
    const { result } = renderHook(() => useSlashCommand(ref));

    // Assert
    const commands = result.current.filteredItems.map((i) => i.command);
    expect(commands).not.toContain("/new");
    expect(commands).toEqual(expect.arrayContaining(["/btw", "/code-search"]));
  });

  it("includes /new in the built-in commands on a cloud backend", () => {
    // Arrange
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    mockConversation.data = { conversation_version: "V1" };
    mockSkills.data = [];

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ActiveBackendProvider, null, children);

    // Act
    const ref = makeChatInputRef();
    const { result } = renderHook(() => useSlashCommand(ref), { wrapper });

    // Assert
    const commands = result.current.filteredItems.map((i) => i.command);
    expect(commands).toContain("/new");
  });
});
