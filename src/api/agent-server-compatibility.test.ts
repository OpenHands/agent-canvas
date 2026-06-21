import { describe, expect, it } from "vitest";
import {
  AgentServerUnknownVersionError,
  AgentServerUnsupportedVersionError,
  assertAgentServerVersionIsSupported,
  getDisplayAgentServerVersion,
  type AgentServerInfo,
} from "./agent-server-compatibility";

const serverInfo = (version?: string): AgentServerInfo =>
  ({ version }) as AgentServerInfo;

describe("agent-server version compatibility", () => {
  it("classifies missing and unknown versions separately from old versions", () => {
    for (const version of [undefined, "", "unknown", " UNKNOWN "]) {
      expect(() =>
        assertAgentServerVersionIsSupported(serverInfo(version)),
      ).toThrow(AgentServerUnknownVersionError);
    }
  });

  it("classifies malformed versions separately from old versions", () => {
    expect(() =>
      assertAgentServerVersionIsSupported(serverInfo("dev-build")),
    ).toThrow(AgentServerUnknownVersionError);
  });

  it("keeps valid but too-old versions on the unsupported-version path", () => {
    expect(() =>
      assertAgentServerVersionIsSupported(serverInfo("0.0.1")),
    ).toThrow(AgentServerUnsupportedVersionError);
  });

  it("does not render unknown or malformed versions as backend badges", () => {
    expect(getDisplayAgentServerVersion(serverInfo("unknown"))).toBeNull();
    expect(getDisplayAgentServerVersion(serverInfo("dev-build"))).toBeNull();
    expect(getDisplayAgentServerVersion(serverInfo("1.28.0"))).toBe("1.28.0");
  });
});
