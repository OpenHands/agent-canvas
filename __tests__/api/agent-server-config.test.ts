import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKING_DIR,
  buildConversationWorkingDir,
  getAgentServerBaseUrl,
  getAgentServerFormDefaults,
  getAgentServerSessionApiKey,
  getAgentServerWorkingDir,
  isAuthRequired,
  isAuthRequiredAndMissing,
  shouldLoadPublicSkills,
} from "#/api/agent-server-config";

const ORIGINAL_LOCATION = window.location;

function mockWindowLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
});

describe("agent server config", () => {
  it("uses VITE_BACKEND_BASE_URL when it is provided", () => {
    mockWindowLocation("https://work-1.example.dev/settings");
    vi.stubEnv("VITE_BACKEND_BASE_URL", "https://agent.example.com/");

    expect(getAgentServerBaseUrl()).toBe("https://agent.example.com");
  });

  it("uses the browser origin when no backend URL is configured", () => {
    mockWindowLocation("https://work-1.example.dev/settings");

    expect(getAgentServerBaseUrl()).toBe("https://work-1.example.dev");
  });

  it("does not rewrite localhost backend URLs to the browser origin", () => {
    mockWindowLocation("https://work-1.example.dev/settings");
    vi.stubEnv("VITE_BACKEND_BASE_URL", "http://127.0.0.1:8000");

    expect(getAgentServerBaseUrl()).toBe("http://127.0.0.1:8000");
  });

  it("prefills the settings form from environment defaults", () => {
    vi.stubEnv("VITE_BACKEND_BASE_URL", "https://env-agent.example.com/");
    vi.stubEnv("VITE_SESSION_API_KEY", "env-session-key");

    expect(getAgentServerFormDefaults()).toEqual({
      baseUrl: "https://env-agent.example.com",
      sessionApiKey: "env-session-key",
    });
    expect(getAgentServerSessionApiKey()).toBe("env-session-key");
  });

  it("defaults the working dir to the relative workspace path", () => {
    expect(getAgentServerWorkingDir()).toBe(DEFAULT_WORKING_DIR);
  });

  it("nests each conversation's working dir under the configured base using the hex id", () => {
    vi.stubEnv("VITE_WORKING_DIR", "/srv/workspaces/");

    expect(
      buildConversationWorkingDir("4a8dca37-3bf0-48de-a0af-949d711c3d48"),
    ).toBe("/srv/workspaces/4a8dca373bf048dea0af949d711c3d48");
  });

  it("loads public skills by default when VITE_LOAD_PUBLIC_SKILLS is unset", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "");

    expect(shouldLoadPublicSkills()).toBe(true);
  });

  it("loads public skills when VITE_LOAD_PUBLIC_SKILLS is explicitly 'true'", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "true");

    expect(shouldLoadPublicSkills()).toBe(true);
  });

  it("does not load public skills only when VITE_LOAD_PUBLIC_SKILLS is explicitly 'false'", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "false");

    expect(shouldLoadPublicSkills()).toBe(false);
  });
});

describe("isAuthRequired", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_AUTH_REQUIRED__;
  });

  it("returns false when neither env var nor window flag is set", () => {
    expect(isAuthRequired()).toBe(false);
  });

  it("returns true when VITE_AUTH_REQUIRED is 'true'", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    expect(isAuthRequired()).toBe(true);
  });

  it("returns true when window.__AGENT_CANVAS_AUTH_REQUIRED__ is set", () => {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = true;
    expect(isAuthRequired()).toBe(true);
  });

  it("returns false when window flag is a non-true value", () => {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = "true";
    expect(isAuthRequired()).toBe(false);
  });
});

describe("isAuthRequiredAndMissing", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_AUTH_REQUIRED__;
  });

  it("returns false when VITE_AUTH_REQUIRED is not set", () => {
    expect(isAuthRequiredAndMissing()).toBe(false);
  });

  it("returns true when VITE_AUTH_REQUIRED is true and no key is baked in", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    vi.stubEnv("VITE_SESSION_API_KEY", "");

    expect(isAuthRequiredAndMissing()).toBe(true);
  });

  it("returns true via window flag when no key is baked in", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = true;

    expect(isAuthRequiredAndMissing()).toBe(true);
  });

  it("returns false when VITE_AUTH_REQUIRED is true but VITE_SESSION_API_KEY is baked in", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    vi.stubEnv("VITE_SESSION_API_KEY", "baked-key");

    expect(isAuthRequiredAndMissing()).toBe(false);
  });

  it("returns false for non-'true' values of VITE_AUTH_REQUIRED", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "false");

    expect(isAuthRequiredAndMissing()).toBe(false);
  });
});
