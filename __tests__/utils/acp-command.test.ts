import { describe, expect, it } from "vitest";
import { formatCommand, parseCommand } from "#/utils/acp-command";

describe("parseCommand", () => {
  it("splits a simple npx invocation into argv tokens", () => {
    expect(
      parseCommand("npx -y @agentclientprotocol/claude-agent-acp"),
    ).toEqual(["npx", "-y", "@agentclientprotocol/claude-agent-acp"]);
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

  it.each([
    // Each operator becomes a ``{op}`` entry from shell-quote that the
    // string filter drops — only the bare-string tokens survive. We
    // cover the common operators a user might type ahead of switching
    // to a ``bash -c`` wrapper.
    ["pipe", "npx a | tee log", ["npx", "a", "tee", "log"]],
    ["semicolon", "npx a ; npx b", ["npx", "a", "npx", "b"]],
    ["and", "npx a && npx b", ["npx", "a", "npx", "b"]],
    ["or", "npx a || npx b", ["npx", "a", "npx", "b"]],
    ["append redirect", "npx a >> log", ["npx", "a", "log"]],
  ])("filters %s operator out of the argv", (_label, input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it("treats blank input as an empty argv", () => {
    expect(parseCommand("")).toEqual([]);
    expect(parseCommand("   \t\n   ")).toEqual([]);
  });

  describe("shell-metasyntax handling — actual behaviour", () => {
    // Important framing: ``parseCommand`` is a textarea-to-argv
    // *parser*, not a security boundary. The user IS the operator of
    // canvas — they can type any command they want, and it gets
    // exec()'d in the agent-server subprocess they themselves
    // configured. The behaviour we pin here is "what the persisted
    // ``acp_command`` looks like given a shell-syntax-ish input,"
    // not "what canvas refuses to let the user do."
    //
    // What we DO want to verify (and what ``shell-quote.parse`` +
    // the string-only filter actually deliver):
    //
    //   - shell *operators* that have no argv equivalent (redirects,
    //     pipes, ``&&``, ``;``, globs, comments) are dropped, so the
    //     user can't accidentally ship a stray argv token containing
    //     a ``>`` or a ``*``.
    //   - text that LOOKS like shell expansion (backticks, ``$VAR``,
    //     ``$(...)``) survives in some form as literal tokens —
    //     specifically, we DO NOT expand it at parse time. No env
    //     value gets read, no subshell runs.
    //
    // Each test pins the actual ``shell-quote`` output. Behaviour
    // changes upstream surface here as failures.

    it("does not env-expand $VAR at parse time", () => {
      // The forbidden outcome would be ``shell-quote`` reading
      // ``process.env.ANTHROPIC_API_KEY`` and inlining its value
      // into the persisted ``acp_command`` — that would leak a
      // host env var into settings on every save. Actual behaviour:
      // the var ref becomes an empty string (when unset) or the
      // referenced value (when set) IF the parser had env access;
      // ``shell-quote`` is given no env, so it consistently yields
      // empty string. Either way, NO literal ``$ANTHROPIC_API_KEY``
      // is preserved in the argv — which is fine for our use, since
      // we want users to set ``acp_env`` for env vars rather than
      // inlining them.
      const result = parseCommand("npx $ANTHROPIC_API_KEY");
      expect(result[0]).toBe("npx");
      // What we forbid: literal env value showing up here. With no
      // env supplied to shell-quote, the result is just [""], which
      // is harmless (Save button gates on non-empty tokens).
      expect(result.some((t) => /sk-ant-/.test(t))).toBe(false);
    });

    it("does not run subshells: $(...) becomes inert literal fragments", () => {
      // ``$(date)`` shell-quotes to ``["$", {op: "("}, "date", {op:
      // ")"}]``. After the string filter: ``["$", "date"]``. The
      // forbidden outcome is shell-quote *executing* ``date`` and
      // injecting today's timestamp; neither happens. ``date`` is
      // preserved as a literal token but never resolved.
      expect(parseCommand("echo $(date)")).toEqual(["echo", "$", "date"]);
    });

    it("does not run subshells: backticks become a single literal token", () => {
      // ``\`date\``` round-trips as the literal string ``\`date\```.
      // shell-quote doesn't recognise backtick command-substitution
      // in parse mode (which is fine for our use — the agent-server's
      // ``execve`` doesn't interpret backticks either).
      expect(parseCommand("echo `date`")).toEqual(["echo", "`date`"]);
    });

    it("drops glob patterns instead of expanding them against the FS", () => {
      // ``*.txt`` becomes ``{op: "glob", pattern: "*.txt"}`` and
      // falls out of the argv. The forbidden outcome would be
      // expanding against the cwd at parse time, which would (a)
      // leak the filesystem layout into the persisted setting and
      // (b) produce a different command across machines.
      const result = parseCommand("rm *.txt");
      expect(result).toEqual(["rm"]);
      expect(result.some((t) => t.includes("*"))).toBe(false);
    });

    it("strips shell comments so trailing text doesn't poison the argv", () => {
      // A user copy-pasting a shell tutorial line
      // (``mycmd --flag # explanation``) shouldn't ship the
      // ``# explanation`` as an extra argv token. ``shell-quote``
      // represents the trailing ``#`` as ``{comment: "..."}`` and
      // we drop it with the rest of the non-string entries.
      expect(parseCommand("mycmd --flag # this is a comment")).toEqual([
        "mycmd",
        "--flag",
      ]);
    });

    it("survives malformed input without crashing (try/catch guard)", () => {
      // shell-quote is permissive about most malformed inputs (an
      // unterminated quote yields an unwrapped token, not a throw),
      // but the function still wraps in try/catch so a future
      // upstream change can't crash the Settings → Agent form
      // mid-render. The Save button gates on a non-empty argv, so
      // a parse-time anomaly can't silently persist either.
      expect(parseCommand('bash -c "unterminated')).toEqual([
        "bash",
        "-c",
        "unterminated",
      ]);
      // Direct exercise of the catch branch: a synthetic input that
      // throws is hard to construct against shell-quote's current
      // behaviour. We pin the documented contract instead by
      // confirming an empty argv falls out of any input that
      // produces no usable string tokens.
      expect(parseCommand("> | && ;")).toEqual([]);
    });
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
    expect(
      formatCommand(["npx", "-y", "@agentclientprotocol/claude-agent-acp"]),
    ).toBe("npx -y @agentclientprotocol/claude-agent-acp");
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
      // Empty-string tokens are rare but valid (some CLIs treat an
      // empty positional as "no argument supplied" rather than missing).
      // Without explicit quoting in formatCommand they round-trip back
      // as fewer tokens, silently dropping the empty slot.
      ["bash", "-c", ""],
      ["program", "", "--flag"],
    ];
    for (const argv of cases) {
      expect(parseCommand(formatCommand(argv))).toEqual(argv);
    }
  });

  it("renders an empty argv as an empty string", () => {
    expect(formatCommand([])).toBe("");
  });

  it("explicitly quotes empty-string tokens so they survive the round trip", () => {
    // Direct assertion on the rendered form — without this rule,
    // formatCommand(["bash","-c",""]) would render ``"bash -c "`` and
    // parseCommand would return ``["bash", "-c"]``, losing the empty arg.
    expect(formatCommand(["bash", "-c", ""])).toBe("bash -c ''");
  });
});
