---
description: Refresh CHECKPOINT.md to the current work state and commit it
---
Update `CHECKPOINT.md` (repo root) so any teammate in any seat can resume cold.
Optional title for this log entry: $ARGUMENTS

1. Read the current `CHECKPOINT.md`.
2. Inspect real state: `git status`, `git log --oneline -15`, the current branch, and the diff
   since the last checkpoint commit.
3. Make these sections accurate and terminal: Task & branch · Decisions (don't relitigate) ·
   Done (with commit refs) · Outstanding / blockers · Next steps (ordered) · How to verify ·
   Key IDs / secret status.
4. Add a dated entry to the top of the Checkpoint log (use "$ARGUMENTS" as its title if provided).
5. Commit `CHECKPOINT.md` with message `checkpoint: <short summary>` and push to the working branch.

NEVER write secret values (API tokens, access codes) — names and set/unset status only.
