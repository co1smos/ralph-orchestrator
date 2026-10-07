# Ralph Orchestrator Architecture

> Status: authoritative owner-review design. The design frontier is closed; implementation details may be refined without changing these owner-set boundaries.

## Purpose

Provide a small, repo-local autonomous coding workflow that consumes GitHub issues created by Matt Pocock's `to-tickets` workflow and executes the currently ready tickets without manual ticket selection.

This repository starts from a copied `.sandcastle` baseline from `jev_demo`. That baseline preserves the proven fresh implementer, deterministic test, fresh read-only reviewer, and correction loop. It is implementation provenance, not architectural authority: this document defines the target system, and Sandcastle remains only the worktree/sandbox substrate.

## Sources of truth

- GitHub issues and their `to-tickets` dependency relationships are the durable task graph and completion record.
- An open issue is eligible only when it carries the repository's ready-for-agent marker and all declared blockers are closed.
- Native GitHub dependency metadata is preferred. Explicit blocker declarations emitted in ticket text may be supported as a compatibility fallback for the copied baseline.
- The orchestrator rereads GitHub at every outer-iteration boundary. It does not maintain a competing task database or durable scheduler state.
- A ticket is complete only after its candidate is integrated and the corresponding GitHub issue is closed.

## System boundary

```text
                         GitHub Issues
                 (to-tickets task/dependency graph)
                              |
                              v
                 +-------------------------+
                 |   Ralph Orchestrator    |
                 | exactly one per repo    |
                 +-------------------------+
                    |        |        |
             ready ticket  ready ticket  ready ticket
                    |        |        |
                    v        v        v
              +---------+ +---------+ +---------+
              | Ralph A | | Ralph B | | Ralph C |
              +---------+ +---------+ +---------+
                 |            |            |
             implement     implement     implement
                 |            |            |
               tests        tests        tests
                 |            |            |
              review <-> correction loops
                 |            |            |
                 +------ reviewed candidates -----+
                                      |
                                      v
                              +---------------+
                              | Merger Agent  |
                              +---------------+
                                      |
                         integrate, test, push,
                           close merged issues
                                      |
                                      v
                             verify iteration
                                      |
                         rescan GitHub frontier
                                      |
                                      v
                              next iteration

        -------------------------------------------------

                       AFK Operator Skill
                              |
                   starts one orchestrator
                              |
               observes orchestrator + all owned
                    Herdr execution surfaces
                              |
                 healthy -> leave it alone
                 unhealthy -> stop owned run,
                              clean owned surfaces,
                              back off if needed,
                              restart one orchestrator
```

## Core invariants

1. Exactly one top-level orchestrator may own a repository at a time.
2. GitHub and `to-tickets` relationships determine the ready frontier; neither the operator nor a supervisor manually chooses ordinary tickets.
3. One outer iteration operates on one snapshot of the ready frontier.
4. The orchestrator selects up to its parallelism limit using deterministic ordering, initially ascending issue number.
5. Each selected ticket receives an independent Ralph pipeline and isolated Sandcastle worktree/branch.
6. Selected ticket pipelines run concurrently and settle with `allSettled` semantics: one ticket's failure never cancels healthy siblings.
7. The merger phase begins only after every selected pipeline has settled.
8. Only successful, reviewed candidates enter the merger phase.
9. Every implementer, reviewer, correction implementer, and merger agent is visible and attributable in Herdr.
10. Sandcastle supplies worktree/sandbox lifecycle only. It does not own scheduling, dependency resolution, supervision, or durable task state.
11. The orchestrator owns the normal path. The separate AFK operator Skill owns startup, monitoring, and coarse whole-run recovery.

## Outer iteration lifecycle

Each iteration performs these steps in order:

1. Read the repository's open GitHub issues and dependency state.
2. Compute the ready-for-agent frontier.
3. Deterministically select up to the configured parallelism limit.
4. If no issue is ready, stop successfully.
5. Launch one independent ticket pipeline for every selected issue.
6. Wait for all selected pipelines to settle without sibling cancellation.
7. Record ticket-local failures as failed for this iteration; leave their issues open.
8. Collect only successful reviewed candidates.
9. If candidates exist, launch one fresh dedicated merger agent.
10. Verify the merger's observable results.
11. Rescan GitHub and begin the next iteration.

A failed open ticket may become eligible again in a later iteration. V1 does not preserve phase-level progress across retries or orchestrator restarts.

## Per-ticket Ralph pipeline

```text
ticket
  |
  v
fresh implementer
  |
  v
deterministic focused test gate
  |
  +-- failure ----------------------------> ticket fails this iteration
  |
  v
fresh read-only reviewer
  |
  +-- approved --> deterministic final gate --> reviewed candidate
  |
  +-- changes requested --> fresh correction implementer --+
  |                                                        |
  +--------------------------------------------------------+
  |
  +-- blocked / worker failure -----------> ticket fails this iteration
```

The copied `jev_demo` behavior is preserved:

- The initial implementer is fresh.
- Every reviewer is fresh and read-only.
- A correction is performed by a fresh implementation agent with the exact reviewer findings and relevant deterministic test evidence.
- The controller owns deterministic test execution and validates receipts, candidate heads, session freshness, and reviewer non-mutation.
- Worker or process failure fails only that ticket for the current iteration. V1 does not repair or resume that worker in place.

## Merger phase

After all selected ticket pipelines settle, the orchestrator launches one fresh, visible merger agent when at least one reviewed candidate exists.

The merger receives the integration target and each successful ticket's ID, branch, reviewed head, and evidence. It:

1. integrates candidates serially in deterministic order;
2. handles integration conflicts semantically when safe;
3. runs the repository's integration checks after integration;
4. pushes accepted integration changes;
5. closes only issues whose candidates were successfully integrated; and
6. emits a structured receipt describing every accepted or rejected candidate.

A merge conflict or integration failure for one candidate must not falsely complete its issue. The controller independently verifies the target branch, checks, pushed state, and GitHub issue state before considering the iteration complete.

## Singleton ownership

The repository uses the smallest reliable local ownership mechanism available: an atomic repo-local lock carrying an orchestrator run ID and enough process metadata for diagnostics. A second orchestrator must fail closed rather than run concurrently.

The lock is not a distributed lease. The AFK operator may remove it only after establishing that the owned run is no longer alive and cleaning that run's owned execution surfaces.

## Herdr visibility and ownership

The orchestrator creates identifiable Herdr execution surfaces for every agent phase. Each surface must expose or be traceable to:

- repository identity;
- orchestrator run ID;
- ticket number, when ticket-scoped;
- phase and correction round;
- agent/session identity;
- live terminal output and process lifecycle; and
- final receipt or failure status.

The run ID is the cleanup boundary. The operator may act only on surfaces explicitly attributable to the owned run. Tabs, panes, or agents not carrying that ownership evidence are unrelated and must be left alone. The exact Herdr surface type is an implementation detail provided individual agents remain inspectable and attributable.

## Sandcastle boundary

The copied `.sandcastle` baseline is retained for its proven worktree and no-sandbox execution substrate. The target orchestrator may reuse its narrow helpers and contracts where they fit, but must not turn Sandcastle into a second scheduler or supervisor.

Sandcastle owns:

- isolated branch/worktree creation;
- command execution inside that worktree; and
- worktree cleanup.

The orchestrator owns:

- GitHub frontier discovery;
- deterministic selection and parallel ticket scheduling;
- ticket pipeline state;
- deterministic test gates and receipt verification;
- merger dispatch and postcondition verification; and
- outer iteration progression.

## Startup routing

Every model-backed role is routed explicitly at orchestrator startup. V1 exposes independent startup parameters for:

- implementer harness / model / effort;
- reviewer harness / model / effort; and
- merger harness / model / effort.

The public harness vocabulary is `codex`, `claude-code`, and `pi`, but v1 implements only `codex`; unsupported harnesses fail preflight rather than silently degrading. This keeps the interface stable without pretending untested harness support exists. Harness support can be added behind the same phase-launch boundary later.

Example:

```bash
npm run ralph -- \
  --implementer-harness codex --implementer-model gpt-6-luna --implementer-effort max \
  --reviewer-harness codex --reviewer-model gpt-6-astra --reviewer-effort medium \
  --merger-harness codex --merger-model gpt-6-luna --merger-effort high \
  --max-parallel 3
```

## AFK operator Skill

The AFK operator is a separate, small Skill for an outer agent. It does not participate in ordinary ticket execution.

It should:

1. preflight the repository and required tools;
2. establish that no orchestrator already owns the repository;
3. start exactly one orchestrator;
4. periodically inspect that orchestrator and all Herdr surfaces owned by its run ID;
5. leave healthy or merely slow work alone;
6. tolerate ordinary ticket-local failures while the orchestrator continues;
7. treat only global or progress-blocking conditions as unhealthy, such as a dead/frozen orchestrator, owned workers that indefinitely prevent settlement, widespread quota failure, or inconsistent ownership/process state;
8. stop the whole owned run rather than repair an individual worker;
9. clean only surfaces attributable to that run ID;
10. apply a simple bounded backoff when the failure suggests waiting will help;
11. restart exactly one orchestrator; and
12. stop monitoring and report when the workflow completes.

The operator must not duplicate frontier calculation, ticket scheduling, dependency resolution, Ralph correction loops, merge policy, or GitHub state transitions. V1 intentionally uses conservative human-readable health evidence and coarse restart rather than a recovery subsystem.

## Failure semantics

- Ticket-local implementation, test, review, timeout, or worker failures settle that ticket as failed for the iteration.
- Sibling ticket pipelines continue to completion.
- Failed tickets remain open and are not sent to the merger.
- Merger rejection leaves the affected issue open.
- A controller or repository-wide failure fails the outer run; it is not disguised as a collection of ticket failures.
- The AFK operator may restart only after stopping and cleaning the whole owned run.

## Deliberate v1 non-goals

- Per-worker process recovery or in-place worker restart.
- Durable phase-level checkpoints or resume after orchestrator restart.
- A custom task database, queue, or scheduler separate from GitHub.
- Distributed orchestration or multiple top-level orchestrators per repository.
- Complex PID registries, process-tree controllers, leases, or leader election.
- Speculative model switching or elaborate quota-routing policy.
- Automatic rebasing of active ticket work onto sibling candidates during an iteration.
- Parallel or multi-agent merge coordination.
- Encoding rare failure heuristics before repeated evidence justifies them.
- Expanding Sandcastle beyond the current worktree/sandbox substrate.

## Implementation notes

These details do not require further owner decisions:

- Keep dependency parsing compatible with the copied baseline while preferring native GitHub dependency metadata.
- Use stable ascending issue number as the initial selection and merge order.
- Use explicit structured receipts and controller-observed postconditions rather than trusting agent prose.
- Generate one run ID at orchestrator startup and propagate it to lock metadata, artifacts, logs, and Herdr ownership labels.
- Keep health thresholds and backoff constants small, explicit, and locally configurable only when operational evidence requires tuning.
- Reuse the copied baseline's validated session-freshness and read-only-review checks instead of designing parallel mechanisms.
