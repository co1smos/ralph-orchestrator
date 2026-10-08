# Minimal Codex E2E Validation

Validated on 2026-10-07 against private fixture repository `co1smos/ralph-orchestrator-e2e-20261007` in an isolated named Herdr session.

Fixture graph:

```text
#1 create alpha.txt ─┐
                     ├─> #3 create combined.txt
#2 create beta.txt ──┘
```

Observed behavior:

1. Preflight selected `#1` and `#2` as the initial ready frontier with `--max-parallel 2`.
2. Two independent Codex implementer panes ran concurrently in separate Sandcastle worktrees.
3. Fresh read-only reviewer panes followed the implementers.
4. One fresh merger pane merged both reviewed branches, ran `npm test`, pushed `main`, and closed issues #1 and #2.
5. The next outer iteration rescanned GitHub and selected #3 after its blockers were closed.
6. #3 completed implement, review, merge, integration test, push, and issue close.
7. Final remote `main` matched local `main`; all three issues were closed; all worker panes were gone and only the orchestrator shell remained.

The E2E used Codex with `gpt-6-luna` / `low` effort for all three roles to minimize test cost. Claude Code and Pi remain intentionally unimplemented in v1 and fail preflight cleanly.

## Failure-path validation

Mocked failure tests cover:

- one ticket worker/reviewer rejecting while sibling tickets still settle successfully;
- merger candidate selection excluding failed tickets;
- all tickets in an iteration failing, producing no merger candidates;
- malformed merger receipts that omit expected candidates or invent unexpected ones;
- a fatal GitHub/API failure after singleton-lock acquisition, verifying non-zero exit and lock release;
- a second orchestrator starting while another owns the repo, verifying rejection without deleting the first orchestrator's lock.

The last test exposed and fixed a real race: the generic top-level error handler previously removed the singleton lock even when this process had never acquired it. Lock cleanup is now ownership-guarded.
