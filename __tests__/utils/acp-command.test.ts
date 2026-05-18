import { describe, expect, it } from "vitest";
import { formatCommand, parseCommand } from "#/utils/acp-command";

describe("parseCommand", () => {
  it("splits a simple npx invocation into argv tokens", () => {
    expect(parseCommand("npx -y @agentclientprotocol/claude-agent-acp")).toEqual([
      "npx",
      "-y",
      "@agentclientprotocol/claude-agent-acp",
    ]);
  });

  it("respects double-quoted segments — the headline regression .split fix", () => {
    // The old `.split(/\s+/)` implementation turned this into
    // ``["bash", "-c", "\"echo", "hello", "world\""]`` and the spawn
    // would either misbehave or fail in a confusing place. shell-quote
    // keeps the quoted segment intact.
    expect(parseCommand('bash -c "echo hello world"')).toEqual([
      "bash",
      "-c",
      "echo hello world",
    ]);
  });

  it("respects single-quoted segments and embedded escapes", () => {
    expect(parseCommand("env FOO='bar baz' npx -y my-acp")).toEqual([
      "env",
      "FOO=bar baz",
      "npx",
      "-y",
      "my-acp",
    ]);
  });

  it("drops shell operators a user typed but argv can't represent", () => {
    // ``shell-quote`` returns non-string entries for redirects / pipes /
    // env-var refs (``> log.txt`` becomes ``{op: '>'}``); ``parseCommand``
    // filters those out. The trailing filename is still a bare token
    // so it survives — the result is an incomplete argv, but a clean
    // one. The textarea's helper text steers users to wrap shell-y
    // commands in ``bash -c`` (see the quoted-segment test above) when
    // they need redirects or pipes.
    expect(parseCommand("npx my-acp > log.txt")).toEqual([
      "npx",
      "my-acp",
      "log.txt",
    ]);
  });

  it("treats blank input as an empty argv", () => {
    expect(parseCommand("")).toEqual([]);
    expect(parseCommand("   \t\n   ")).toEqual([]);
  });
});

describe("formatCommand", () => {
  it("renders package-style tokens verbatim, no escaping of @ or /", () => {
    // The textarea is the only consumer of formatCommand. Escaping the
    // ``@`` in ``@org/pkg`` produces a hostile read-back (the user
    // copies their existing command, the textarea now shows
    // ``\@org/pkg``, they think we corrupted it). The agent-server
    // execs argv directly so the escape isn't load-bearing for
    // behaviour — only for display.
    expect(formatCommand(["npx", "-y", "@agentclientprotocol/claude-agent-acp"])).toBe(
      "npx -y @agentclientprotocol/claude-agent-acp",
    );
  });

  it("shell-quotes tokens that contain whitespace", () => {
    expect(formatCommand(["bash", "-c", "echo hello world"])).toBe(
      "bash -c 'echo hello world'",
    );
  });

  it("round-trips arbitrary argv arrays through parseCommand", () => {
    const cases: string[][] = [
      ["npx", "-y", "@agentclientprotocol/claude-agent-acp"],
      ["npx", "-y", "@zed-industries/codex-acp"],
      ["npx", "-y", "@google/gemini-cli", "--acp"],
      ["bash", "-c", "echo hello world"],
      ["env", "FOO=bar baz", "npx", "-y", "my-acp"],
      ["./bin/my-agent", "--flag=value"],
    ];
    for (const argv of cases) {
      expect(parseCommand(formatCommand(argv))).toEqual(argv);
    }
  });

  it("renders an empty argv as an empty string", () => {
    expect(formatCommand([])).toBe("");
  });
});
