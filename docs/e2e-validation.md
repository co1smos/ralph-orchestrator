# End-to-end validation

Use this guide to verify a **new installation** of Ralph Orchestrator. Automated controller tests run locally; a full agent/GitHub smoke test needs a disposable target repository, a Herdr terminal, configured Codex models, and an authenticated GitHub CLI.

## Automated checks

In a checkout where the runner has been installed:

```sh
npm run test:ralph
```

In the Ralph source repository, `npm test` runs the same controller tests. They cover CLI routing, GitHub dependency/frontier selection, reviewer and merger receipt contracts, pending-criteria convergence, failure isolation, singleton-lock ownership, and controller process failure.

## Disposable GitHub smoke test

Never use production tickets to test a new controller setup.

1. Create a **disposable** GitHub repository with a working `npm test` (or set the focused/final/integration test commands explicitly).
2. Add three simple issues and label each `ready-for-agent`:
   - **#1:** Create `alpha.txt` with a testable fixed value.
   - **#2:** Create `beta.txt` with a testable fixed value.
   - **#3:** Create `combined.txt` from the two files. Mark both #1 and #2 as native blockers of #3, or include `Blocked by: #1, #2` in #3's body.
   Each issue should have an explicit `## Acceptance criteria` checklist.
3. Install Ralph as described in [INSTALL.md](../INSTALL.md) and verify that all phase models and their authentication work. Use `--max-parallel 2`.
4. From a Herdr terminal, run the preflight command in [README: Run](../README.md#run). Confirm the first `readyIssues` contains #1 and #2 but not #3.
5. Start the orchestrator with the same model routing. It should run #1 and #2 concurrently in independent worktrees; after separate read-only reviews, the merger should integrate both and close their issues.
6. Confirm the next GitHub rescan unlocks #3. It should then be implemented, tested, reviewed, merged, pushed, and closed.
7. Check actual exit status, remote branch and issue states, and saved receipts under `.sandcastle/runs/<run-id>/`. Confirm every created worker pane has been cleaned up without affecting unrelated Herdr panes.

The acceptance condition is observed behavior, not a successful shell exit alone.

## Failure scenarios

The controller's automated tests separately exercise:

- A rejected ticket while an independent sibling succeeds.
- A merger receiving only successful reviewed candidates.
- An iteration in which every candidate fails.
- Rejection of incomplete or invented merger receipts.
- A fatal controller error releasing its own lock.
- A second controller being rejected without deleting the first controller's lock.
- Review of only pending acceptance criteria and a fresh full-criteria final review.

Test live-provider, credential, billing, deployment, or delivery gates only with explicit authorization in an appropriate environment; the disposable smoke test should not invoke them.
