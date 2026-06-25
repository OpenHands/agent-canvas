# `.checks/result.json` — the verification contract

> **One file is the interface.** An agent that verifies its own work writes
> `.checks/result.json` into its conversation worktree. The cockpit **Checks
> tab** reads it and shows a pass/fail verdict plus pointers to the durable
> artifacts (the committed test, the recording, the trace) a reviewer inspects
> to approve a change **without running anything locally**.
>
> The contract is **framework- and language-neutral.** Playwright is the
> reference adapter (and the cockpit's own self-hosting bootstrap), **not** part
> of the contract. Anything in any repo — pytest, `go test`, `cargo`, a shell
> script — that writes this file lights up the tab. This document is the seam.

The authoritative schema is [`src/utils/check-result.ts`](../../src/utils/check-result.ts)
(`CheckResult.parse`). This doc explains it for **writers**; the parser is the
reader and the single source of truth.

## The file

- **Path:** `.checks/result.json`, at the **worktree root** (the constant
  `CHECK_RESULT_PATH`). One file per conversation worktree.
- **When:** the agent writes it after it verifies its change. The
  `result.json` is committable; the heavy `video`/`trace` binaries are
  gitignored (they go to a media branch later — Bet D A3).
- **Advisory.** The verdict is _informational_. It surfaces proof; it does
  **not** gate, block, or auto-merge anything. A red verdict is a successful
  emit, not a failed hook.

## Schema

```jsonc
{
  "status": "passed" | "failed",        // overall verdict
  "checks": [                            // per-behavior results (may be empty)
    {
      "title":      "loads the cockpit", // human-readable; may be null
      "status":     "passed" | "failed",
      "durationMs":  1240,               // optional
      "error":      "expected visible…"  // optional; failure detail
    }
  ],
  "spec":      "tests/e2e/verified/x.spec.ts", // the committed test — worktree-relative
  "video":     ".checks/0-run.webm",           // recording — worktree-relative OR https URL
  "trace":     ".checks/0-run.zip",            // deep replay artifact — Playwright only
  "commit":    "abc1234",                      // commit the run executed against
  "createdAt": "2026-06-25T08:00:00.000Z"      // ISO-8601
}
```

Every field except `status` may be omitted or `null`. The parser is **total
and defensive**: malformed JSON, a missing verdict, or an unparseable field
degrades to "unreadable" or drops the field — it **never throws** and never
invents a green.

| Field       | Meaning                       | Notes                                                                                                                                             |
| ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`    | Overall verdict               | A red check **overrides** this — see the trust model.                                                                                             |
| `checks[]`  | One row per verified behavior | `title` is cosmetic; a missing title is **never** a reason to drop a row.                                                                         |
| `spec`      | The committed test source     | **The load-bearing review artifact.** Worktree-relative path; never a URL. For non-web stacks it is often the _only_ artifact — make it non-null. |
| `video`     | The human-watchable proof     | Worktree-relative path, **or** an absolute `https?://` URL (a media-branch URL once A3 lands). Null is fine (non-UI work).                        |
| `trace`     | Deep replay artifact          | **Playwright-specific** (a trace `.zip`). Non-Playwright emitters leave it null.                                                                  |
| `commit`    | Provenance                    | Short sha the run executed against.                                                                                                               |
| `createdAt` | When the run finished         | ISO-8601.                                                                                                                                         |

## The trust model (what the reader guarantees)

The writer is **untrusted** — any agent, in any target repo, can write this
file. So the parser, not the writer, owns the invariants:

1. **A red check forces `failed`.** If any `checks[]` entry is `failed`, the
   overall verdict is `failed` — _even if_ the writer set `"status":"passed"`.
   A verification surface must never show green over a red. You cannot paint a
   red run green.
2. **A titleless check is never dropped.** A row needs only a recognizable
   `status`; a missing `title` renders a status-word fallback. (Dropping a
   titleless `failed` row would erase a red result before rule 1 runs.)
3. **Artifact pointers are constrained to the worktree.** `spec`/`video`/`trace`
   that are absolute, contain a `..` segment, or carry a non-`http(s)` scheme
   are dropped to `null` — an untrusted emitter cannot smuggle in a path that
   escapes the worktree when resolved against the fileserver.
4. **No verdict ⇒ unreadable, not green.** A file with neither an explicit
   `status` nor any checks shows an honest "unreadable" state, never a false
   pass.

**What the reader does _not_ guarantee:** it stops a _green-over-red_ lie, not a
_fully fabricated_ green (`{"status":"passed","checks":[]}` over broken code).
Under advisory-first that is acceptable because nothing auto-merges — the real
defense is the **durable artifact**: the human reads the committed `spec` and
watches the `video`. For non-web work where there is no video, **the committed
test is the sole corroborator** — so always emit `spec`.

## Writing it

Three rules every writer must honor (the reader enforces #1–#3 above, but emit
honestly so the artifacts mean something):

- **Emit honest per-test rows.** Don't compute the overall verdict yourself and
  lie — the reader re-derives it. Just report each behavior truthfully.
- **Don't write on an empty run.** If _nothing ran_ (no tests collected, the dev
  server never booted), write **no file** rather than a meaningless "passed".
  Note `pytest`/`go test`/`cargo` exit **0** with zero tests collected — detect
  that and skip the write.
- **Point `spec` at the committed test**, and `commit` at the commit that
  _contains_ it (stamp after committing, or mark a dirty tree `-dirty` — a bare
  `git rev-parse HEAD` on a dirty worktree is misleading provenance).

### Playwright (reference adapter)

Already wired: the cockpit's `verified-*` projects + the
[`checks-reporter`](../../tests/e2e/verified/checks-reporter.ts) (gated by
`EMIT_CHECKS`). This is the bootstrap for a _web_ target that already has
Playwright — reuse it if present; do not scaffold it from nothing.

```sh
EMIT_CHECKS=1 npx playwright test --project=verified-dev
```

### WRAP — the universal floor (any runner, any language)

When there's no native JSON reporter (shell, `make`, `cargo`, a greenfield
repo), wrap the verify command: one check whose verdict is the command's exit
code. **The wrapped command MUST exit non-zero on failure** — use
`set -o pipefail`, avoid a trailing `; true`, or the green is not trustworthy.

```sh
# WRAP: one honest check from an exit code. spec = the committed test you wrote.
spec="tests/test_login.py"
out=$(pytest -q "$spec" 2>&1); code=$?
# (skip the write entirely if nothing ran — see "Don't write on an empty run")
mkdir -p .checks
jq -n --arg s "$([ $code -eq 0 ] && echo passed || echo failed)" \
      --arg spec "$spec" \
      --arg err "$out" \
      --arg commit "$(git rev-parse --short HEAD)" \
      --arg at "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
      '{status:$s, checks:[{title:"verify", status:$s, error:$err}],
        spec:$spec, video:null, trace:null, commit:$commit, createdAt:$at}' \
   > .checks/result.json
```

WRAP is coarse — it collapses a multi-test suite into **one** pass/fail row and
loses per-test triage. That's an honest floor; upgrade to a PARSE adapter (below)
once a suite is large enough that a reviewer needs to see _which_ test failed.

### PARSE — richer per-test rows (optional, per runner)

When a runner emits machine-readable results, normalize them into `checks[]` for
real per-test granularity. A PARSE adapter is a thin `output → checks[]`
transform; it still never sets the top-level verdict or writes the file by hand.

```sh
pytest --json-report --json-report-file=.report.json tests/   # then map → checks[]
go test -json ./...                                            # then map → checks[]
```

## Adapter rule

An **adapter** (Playwright reporter, a pytest/go normalizer, WRAP) produces
per-test **facts** — `{title, status, error?, durationMs?}` — and optional
artifact paths. **It never sets the overall verdict and never owns the
invariants.** The verdict math and the worktree/no-empty/commit discipline live
in one place (the reader, plus the shared emit helper when it exists), so adding
a new language is "produce per-test facts," nothing more.

## See also

- [`src/utils/check-result.ts`](../../src/utils/check-result.ts) — the parser /
  authoritative schema (read side).
- [`tests/e2e/verified/checks-reporter.ts`](../../tests/e2e/verified/checks-reporter.ts)
  — the Playwright reference adapter + self-hosting bootstrap.
- `.context/research/autonomous-qa.md` — the Bet D design, the per-target
  generalization rationale, and the open questions (workspace-local).
