# Ralph Orchestrator

A lightweight multi-ticket coding orchestrator built around a Ralph-style **implement → test → read-only review → correct** loop.

It takes ready GitHub issues, executes independent tickets in parallel worktrees, sends reviewed candidates through one merger agent, then rescans GitHub for newly unblocked work. Every model-backed phase is visible in Herdr.

The goal is deliberately small: keep deterministic workflow mechanics in code, keep agents bounded to clear roles, and leave unusual operational recovery to an outer agent using the included AFK operator Skill. The controller, prompts, schemas and tests live in [`src/`](./src/).

## Quickstart

**Give this to your coding agent from the GitHub repository you want Ralph to manage:**

```text
Set up Ralph Orchestrator in this repository and start its eligible GitHub tickets.

Clone https://github.com/co1smos/ralph-orchestrator into a temporary directory.
Read its INSTALL.md and skills/ralph-afk-operator/SKILL.md.
Install the repo-local controller here without overwriting existing project config.
Verify prerequisites and project tests, run Ralph preflight, then start one
full-frontier run inside Herdr using available Codex models.
Follow the AFK Skill for supervision; honor ticket dependencies and execution gates.
```

For the step-by-step procedure, see **[INSTALL.md](./INSTALL.md)**. Ralph runs in your **target repository**, not in the cloned source checkout. Install the controller under `tools/ralph/src/` to avoid colliding with your application's `src/` directory.

## How it works

```text
GitHub issues
          |
          v
  one Ralph orchestrator
          |
          v
   ready issue frontier
      /    |    \
     v     v     v
   ticket ticket ticket
     |      |      |
 implement / test / read-only review
     ^      ^      ^
     +--- correction loop ---+
            |
            v
      reviewed candidates
            |
            v
       merger agent
            |
      test / push / close
            |
            v
       rescan GitHub
```

Each outer iteration snapshots up to `--max-parallel` ready issues. Ticket pipelines settle independently with `Promise.allSettled`: one failed ticket does not cancel healthy siblings. Only successfully reviewed candidates reach the merger.

See [architecture.md](./architecture.md) for the detailed execution contract.

## Ticket contract

GitHub issues are the durable task and completion source of truth. The workflow expects actionable issues to carry the `ready-for-agent` label.

For drafting new tickets, the repo includes [to-better-tickets](./skills/to-better-tickets/SKILL.md), adapted from Matt Pocock's MIT-licensed `to-tickets`. It carries Must Work / Acceptable Failure decisions forward and separates technical blockers from live-activation gates.

Dependencies can come from GitHub issue dependencies when available. As a fallback, issue bodies may declare:

```text
Blocked by: #12, #14
```

or:

```text
Depends on: #12
```

A ticket becomes runnable when it is open, labeled `ready-for-agent`, and all declared blockers are closed. Ralph depends only on this GitHub issue contract, not on a particular ticket generator.

## Per-ticket Ralph loop

For every selected ticket:

1. The controller extracts the fixed checklist under `## Acceptance criteria` and assigns stable IDs (`AC1`, `AC2`, ...). Older tickets fall back to checklist items, then to one whole-ticket criterion.
2. Sandcastle creates an isolated worktree/branch.
3. A fresh implementer agent makes a candidate commit.
4. The controller runs the configured focused test deterministically.
5. A fresh **read-only** reviewer evaluates only acceptance criteria that are still pending. Passed criteria stay passed during correction rounds. Non-blocking review notes are saved as `followups` without triggering corrections.
6. Failed criteria and their exact findings go to a fresh correction implementer; the next reviewer checks only those pending criteria.
7. Once every criterion has passed, a fresh **final reviewer** re-evaluates all original criteria from scratch. Any final-review failure reopens only the failed criteria and returns to the correction loop.
8. The original acceptance criteria are immutable during the run: reviewers cannot invent or append criteria.
9. An implementer can report `blocked` or `failed` with a reason. `completed` requires a committed candidate ahead of the previously reviewed HEAD; on a fresh run an existing candidate branch may be reused after checking its diff and tests, without a dummy commit. Missing-code blocker claims must be verified against the current base checkout. Failed workers and deterministic gates do not cancel siblings.
10. A failed, blocked, or merger-rejected ticket is skipped for the rest of the current orchestrator run. After 20 implement/review rounds, the ticket receives a `needs-triage.json` summary; other ready tickets continue.
11. The controller runs the final acceptance test before exposing the candidate to the merger.

The per-ticket criterion state is kept in the current run and written to `review-state.json` for inspection. It is not a durable resume database; a clean orchestrator restart reviews the original criteria again. Existing committed candidate branches are preserved and can be reused; they must contain the current base SHA, so merge/rebase the latest base into a stale candidate **without discarding its commits** before restarting Ralph.

Sandcastle is used as the worktree/sandbox substrate; scheduling, iteration semantics, review loops, and merge orchestration live in this repository. Ralph's own runtime receipts and singleton lock live under ignored `.ralph/`, while the Sandcastle dependency creates temporary worktrees under ignored `.sandcastle/worktrees/`. During upgrades, a legacy `.sandcastle/orchestrator.lock` prevents concurrent old/new controllers; see [upgrade instructions](./INSTALL.md#upgrade-an-existing-sandcastle-installation).

## Merger

After all ticket pipelines in an iteration settle, one fresh visible merger agent receives only reviewed candidates.

It integrates candidates serially, runs the configured integration test, pushes the target branch, and closes only issues that were actually integrated and pushed. The controller validates the merger receipt and reruns the integration test after the merger returns.

The next outer iteration starts only after merge processing finishes.

## Requirements

- Node.js 22+ and npm
- Git
- GitHub CLI (`gh`) authenticated for the target repository
- [Herdr](https://herdr.dev/) available in `PATH`
- Codex CLI available in `PATH`
- Unsnooze available for Codex execution
- the appropriate Codex provider credential configured in your Codex config/environment

The orchestrator itself must run inside Herdr. It creates sibling Herdr panes for implementers, reviewers, corrections, and mergers. **Workers run with host privileges** using Sandcastle `noSandbox`; do not treat it as an isolation boundary.

## Installation

To install Ralph **into another repository**, follow [INSTALL.md](./INSTALL.md); cloning this source and running `npm install` by itself does not install Ralph into your project.

To work on this source repository:

```bash
git clone https://github.com/co1smos/ralph-orchestrator.git
cd ralph-orchestrator
npm ci
npm test
```

## Run

From the **target repository**, inside **Herdr**, select three available Codex models and effort levels. V1 supports the `codex` harness only; `claude-code` and `pi` are reserved and fail preflight.

Set the model variables to real model IDs supported by your account. Then run preflight and, only when ready, start the orchestrator:

```bash
export IMPLEMENTER_MODEL="your-codex-implementer-model"
export REVIEWER_MODEL="your-codex-reviewer-model"
export MERGER_MODEL="your-codex-merger-model"

# Preflight: inspect the selected readyIssues before starting agents
npm run ralph:check -- \
  --implementer-harness codex --implementer-model "$IMPLEMENTER_MODEL" --implementer-effort high \
  --reviewer-harness codex --reviewer-model "$REVIEWER_MODEL" --reviewer-effort medium \
  --merger-harness codex --merger-model "$MERGER_MODEL" --merger-effort high \
  --max-parallel 3

# Execute: same routing, without --preflight
npm run ralph -- \
  --implementer-harness codex --implementer-model "$IMPLEMENTER_MODEL" --implementer-effort high \
  --reviewer-harness codex --reviewer-model "$REVIEWER_MODEL" --reviewer-effort medium \
  --merger-harness codex --merger-model "$MERGER_MODEL" --merger-effort high \
  --max-parallel 3
```

Keep one controller per target repository. Preflight reads GitHub issues but does not run model-backed ticket phases. Starting Ralph can modify code, push to the target GitHub repository, and close accepted issues.

The default focused, final, and integration commands are `npm test`. Override them for the target repository when necessary:

```bash
--focused-test "npm run test:unit" \
--final-test "npm test" \
--integration-test "npm test"
```

Use `--issue <number>` when intentionally running one ready issue instead of the whole frontier.

## AFK operation

The repo includes project Skills at:

```text
skills/ralph-afk-operator/SKILL.md
skills/to-better-tickets/SKILL.md
```

Read the Skills from the source clone or install them into your agent's supported Skill discovery path. A repository-root `skills/` folder is a catalog, not automatically an installed Skill in every agent runtime. See [INSTALL.md](./INSTALL.md) for repository setup.

An outer agent can use the AFK operator to:

- choose explicit implementer/reviewer/merger routing;
- run preflight and start exactly one orchestrator;
- inspect the orchestrator and its owned Herdr surfaces;
- leave healthy or ordinary ticket-local failures alone;
- monitor at 15 → 30 → 60 → 120 minute intervals when no progress is observed, resetting to 15 minutes after progress;
- summarize `needs_triage` tickets for owner review without blocking unrelated work; and
- perform coarse whole-run stop / cleanup / backoff / restart when the run is genuinely unhealthy, such as shared quota exhaustion or a frozen run.

The Skill intentionally does **not** duplicate ticket scheduling, per-ticket recovery, review logic, or merger behavior.

## Failure semantics

V1 favors simple, observable failure behavior:

- **Ticket-local failure or implementer `blocked`:** the ticket stays open and is skipped for the remainder of this run; independent siblings continue. Review the stored receipt/error before a new run.
- **All tickets fail:** there are no merger candidates.
- **Reviewer requests changes:** start a fresh correction implementer; this is normal workflow, not recovery.
- **20 rounds reached:** pause the ticket for owner triage (also skip it for this run); follow-ups are non-blocking and already stored in reviewer receipts.
- **Merger rejects a candidate:** do not close or reselect that issue until a later run.
- **Fatal controller/API failure:** exit non-zero and release the singleton lock owned by that process.
- **Second orchestrator:** reject startup without disturbing the existing owner's lock.
- **Global/provider failure:** the outer AFK operator handles coarse whole-run recovery rather than the controller growing a complex supervisor.

A run that defers issues exits with `complete_with_failures` (or `complete_with_triage`) and lists the affected issue numbers. This is a terminal, review-required outcome, **not** a reason for the AFK operator to immediately restart. Open issues remain durable truth and a later explicitly initiated run can reconsider them.

## Singleton ownership

Only one top-level orchestrator may own a repository at a time. A repo-local lock prevents two schedulers from racing over the same issue frontier. Lock cleanup is ownership-guarded: a process that failed to acquire the lock cannot delete another orchestrator's lock.

## Validation

The test suite covers routing, dependency/frontier selection, Ralph receipts, merger receipts, ticket failure isolation, merger candidate filtering, fatal controller cleanup, and singleton-lock races.

For a live smoke test, use a **disposable GitHub repository** and follow [the end-to-end validation guide](./docs/e2e-validation.md). Do not perform integration testing against an unrelated production repository.

## Current scope

Intentionally not included in v1:

- Claude Code or Pi execution adapters;
- per-worker restart/resume machinery;
- a durable scheduler database;
- a separate daemon/process supervisor;
- hidden automatic recovery inside ticket phases;
- an LLM planner for choosing ready tickets.

These can be added when actual usage demonstrates the need.
