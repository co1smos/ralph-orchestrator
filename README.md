# Ralph Orchestrator

Design repository for a lightweight multi-ticket coding workflow.

[`architecture.md`](./architecture.md) is the authoritative owner-review design. In summary, the system:

- uses GitHub issues produced by Matt Pocock's `to-tickets` workflow as the task and dependency source of truth;
- runs one top-level orchestrator per repository;
- executes the current ready frontier through parallel, failure-isolated Ralph ticket pipelines;
- preserves fresh implementer, deterministic tests, fresh read-only reviewer, and correction rounds;
- sends successful reviewed candidates to a dedicated visible merger agent;
- rescans GitHub only after the selected pipelines settle and merge processing completes;
- makes every implementation, review, correction, and merge agent visible through Herdr; and
- delegates AFK startup, monitoring, and coarse whole-run recovery to a separate small operator Skill.

The copied `.sandcastle` directory comes from the `jev_demo` baseline. It is retained as proven implementation provenance and as the worktree/sandbox substrate only; it is not the target scheduler or supervisor.

This repository remains design-first. Existing baseline runtime files are not made authoritative by the finalized documentation.

## Run

V1 requires explicit role routing and currently implements Codex only:

```bash
npm run ralph:check -- \
  --implementer-harness codex --implementer-model gpt-6-luna --implementer-effort max \
  --reviewer-harness codex --reviewer-model gpt-6-astra --reviewer-effort medium \
  --merger-harness codex --merger-model gpt-6-luna --merger-effort high \
  --max-parallel 3
```

Remove `--preflight`/use `npm run ralph` after preflight succeeds. See `.agents/skills/ralph-afk-operator/SKILL.md` for AFK supervision behavior.
