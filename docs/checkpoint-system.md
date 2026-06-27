# The checkpoint system

How `comeandget.us` keeps a durable, always-current record of where work stands, so any
session — web, desktop, CI, a different team seat — can resume cold. This generalizes the
original one-off `HANDOFF.md` into a permanent, reliably-maintained checkpoint.

## Why

Sessions run in **ephemeral containers** and across **multiple team seats**. Anything not
committed is lost when a container is reclaimed, and long sessions get summarized. So "where
things stand" must live in a durable, committed, always-current file — not in chat scrollback.

## The canonical file: `CHECKPOINT.md`

- Lives at repo root, tracked in git, **always current**. One per repo.
- Contains: task, branch, decisions made, what's done (with commit refs), blockers, ordered
  next steps, how to verify, and key IDs / secret **status** (never secret values).
- Starts with a dated **Checkpoint log** (newest first) so the history of state is visible.

## When to checkpoint (the policy)

Update `CHECKPOINT.md` and commit it whenever:

1. **On demand** — the user asks, or `/checkpoint` is run.
2. **A feature implementation changes** — code that alters a feature's behavior or structure
   lands (a deploy path, an endpoint, a mechanic, a runtime-affecting config).
3. **A spec / requirements / scope decision changes** — a design choice is made or reversed,
   a requirement added or dropped.
4. **Backstops** — before any `git push`, and before ending a session.

Rule of thumb: if a teammate resuming tomorrow would be surprised by the current state, the
checkpoint is stale — update it.

## How it's made reliable (so it actually gets used)

Three layers, weakest → strongest enforcement:

1. **Convention — `CLAUDE.md`.** States the protocol and is read into context at the start of
   every Claude session, so the agent knows to read and maintain the checkpoint. This is the
   baseline that makes it "get used."
2. **Auto-surface — `SessionStart` hook (`.claude/settings.json`).** Prints `CHECKPOINT.md`
   into context at session start, so the resume state is in front of the agent even before it
   reads `CLAUDE.md`. Guarantees the *read* side.
   ```json
   { "hooks": { "SessionStart": [ { "hooks": [ { "type": "command",
     "command": "if [ -f CHECKPOINT.md ]; then echo '=== CHECKPOINT.md (resume state) ==='; cat CHECKPOINT.md; fi" } ] } ] } }
   ```
3. **On-demand — `/checkpoint`** (`.claude/commands/checkpoint.md`). Makes updating frictionless:
   inspects `git status`/`log`/diff, rewrites the checkpoint, commits, and pushes.

### Optional stronger enforcement (add if drift becomes a problem)

- **Stop hook** — on session end, remind (or block) if tracked files changed but `CHECKPOINT.md`
  did not.
- **PreToolUse guard on `git push`** — warn if the working tree changed since the last checkpoint
  commit (matcher: Bash commands matching `git push`).

These are reminders/guards, not semantic detectors — see Limits.

## Honest limits

Claude Code hooks fire on **harness events** (SessionStart, PreToolUse, PostToolUse, Stop, …),
not on **semantic events** like "a spec changed." So "checkpoint at every feature/spec change"
is enforced by *convention* (the `CLAUDE.md` instruction the agent follows), reinforced by the
hooks above. There is no way to make the harness deterministically detect that a given edit was
a feature change — keep the policy in `CLAUDE.md` crisp so the agent applies it consistently.

## Implementation checklist (to stand this up in a repo)

1. `CHECKPOINT.md` (root) — seed with current state using the sections above.
2. `CLAUDE.md` (root) — the checkpoint protocol (read-first + update triggers).
3. `docs/checkpoint-system.md` — this file.
4. `.claude/commands/checkpoint.md` — the `/checkpoint` command.
5. `.claude/settings.json` — the `SessionStart` hook (or manage via `/config`). Commit as
   **project (shared)** settings so every seat gets it. Teammates may be prompted once to approve
   the project hook — that's expected.
6. Commit all of the above; retire any ad-hoc `HANDOFF.md`.

## Portability to chomey.org

chomey.org runs the parallel feature work on the same branch name. Copy `CLAUDE.md`,
`docs/checkpoint-system.md`, `.claude/commands/checkpoint.md`, and `.claude/settings.json`
verbatim, then seed a repo-specific `CHECKPOINT.md`.
