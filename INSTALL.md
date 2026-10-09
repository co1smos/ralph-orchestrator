# Install Ralph Orchestrator

Ralph is a **repo-local** controller. Install it into the GitHub repository whose issues it should execute, **not** into a separate long-running Ralph service. The controller resolves GitHub issues from its current working directory, creates local worktrees, and invokes that repository's tests.

Use [the AFK operator Skill](skills/ralph-afk-operator/SKILL.md) to supervise a run after setup.

## Requirements

- Node.js 22+ and npm, Git, and an authenticated [GitHub CLI](https://cli.github.com/) (`gh auth status`).
- [Herdr](https://herdr.dev/), Codex CLI, and Unsnooze on `PATH`; configure Codex authentication and an available model for each role.
- A writable target GitHub repository with GitHub Issues enabled, tests or verification commands that can run unattended, and explicit approval for agent execution.
- A Herdr terminal for preflight and orchestration. The controller refuses startup outside Herdr.

**Security:** Ralph currently uses Sandcastle's `noSandbox` execution mode. Workers execute on the host with the privileges granted to their process. Use a trusted environment and restrict credentials, network access, and external actions according to each ticket's authorization. `ready-for-agent` is a scheduling marker, not approval for live side effects.

## 1. Fetch the source

From a scratch directory, clone the source repository (or use a previously verified local checkout):

```sh
git clone --depth 1 https://github.com/co1smos/ralph-orchestrator.git
```

Read its `skills/ralph-afk-operator/SKILL.md` and `README.md` before operating the controller.

## 2. Install into the target repository

From the **target** repository's root:

1. Check `git status` and the target repository's existing `package.json`, test commands, agent instructions, and any existing Ralph installation. Never replace project configuration blindly.
2. Copy the source repository's **tracked `src/` directory** (controller, prompts, schemas, and tests) into **`<target>/tools/ralph/src/`**. This keeps Ralph separate from the target application's own `src/`. If `tools/ralph/` already exists, reconcile file-by-file rather than overwriting it. Do not copy generated runtime state. Ralph loads its prompt/schema files relative to its own script, so it works from this nested location.
3. Keep the target's existing package metadata. If it has no `package.json`, initialize a minimal one with `npm init -y`. Install the controller's dependencies in the target (check source `package.json` for versions):

   ```sh
   npm install --save-dev @ai-hero/sandcastle@0.12.0 tsx@4.21.0 typescript@7.0.2 @types/node@24.10.1
   ```

4. Add these scripts **without removing existing scripts**:

   ```json
   {
     "scripts": {
       "ralph": "tsx tools/ralph/src/main.mts",
       "ralph:check": "tsx tools/ralph/src/main.mts --preflight",
       "test:ralph": "node --test tools/ralph/src/workflow-core.test.mjs tools/ralph/src/orchestrator-process.test.mjs"
     }
   }
   ```

   Keep the target's actual project test command. By default Ralph runs `npm test` for focused, final, and integration gates; either make `npm test` meaningful or pass explicit `--focused-test`, `--final-test`, and `--integration-test` commands at startup. In non-Node projects, these can invoke the project's native test runner.

5. Ignore only generated state: `.ralph/` (run receipts and controller lock), `.sandcastle/worktrees/` and `.sandcastle/patches/` (managed by the Sandcastle dependency), `.sandcastle/orchestrator.lock/` (legacy lock), and `node_modules/`. **Do not ignore the tracked `tools/ralph/src/` sources or tests.** No tracked Ralph source code is installed under `.sandcastle/`.
6. Run `npm run test:ralph` and the target project's tests. Review and commit the setup changes before agents create new worktrees, so every ticket starts from a known base.

## 3. Prepare issues

In the **target** GitHub repository, use the [to-better-tickets Skill](skills/to-better-tickets/SKILL.md) or create tickets manually:

- Label explicitly approved, runnable tickets `ready-for-agent`.
- Define verifiable checklist items under `## Acceptance criteria`; specify supported inputs and acceptable failure modes.
- Record actual technical dependencies as native GitHub issue blockers, or write `Blocked by: #12, #14` in the issue body.
- Keep tickets requiring unresolved credentials, permissions, spending, delivery, or other external approvals gated. Do not satisfy these by generating synthetic acceptance evidence.

## 4. Preflight and start in Herdr

In a Herdr terminal, from the **target** repository, follow the AFK Skill. Choose real Codex model IDs supported by your account and explicit effort levels for implementer, reviewer, and merger. Then use the corresponding commands in [README: Run](README.md#run) to:

1. Run `npm run ralph:check -- ...` and inspect its `readyIssues`.
2. Start **one** `npm run ralph -- ...` using the same routing; omit `--issue` for the full ready frontier.
3. Monitor the run and its Herdr panes through the AFK operator; inspect reviewer receipts, tests, merger results, and GitHub issue states before declaring success.

No model-backed issue execution occurs during `npm run ralph:check`. To use Ralph in a new repository, finish setup and preflight first rather than running this source repository as the target.

## Upgrade an existing `.sandcastle/` installation

1. Stop the existing Ralph controller **and all its owned workers**; preserve unfinished candidate branches, receipts and worktrees. Do not attempt an in-place source upgrade while an old run is active.
2. Move or reconcile the old tracked Ralph controller files from `<target>/.sandcastle/` into `<target>/tools/ralph/src/`; update Ralph scripts, any `typecheck` paths, and repo-local agent instructions. Do **not** move/delete `.sandcastle/worktrees/` or historical `.sandcastle/runs/`; they are independent runtime evidence.
3. The new controller writes runs and its singleton lock under `.ralph/` and refuses startup if `.sandcastle/orchestrator.lock/` still exists. Only after independently verifying the legacy controller is stopped may an operator remove a stale legacy lock.
4. Run the controller tests and preflight from the target repository **and in a representative temporary Git worktree without its own `node_modules/`** before resuming the eligible ticket frontier. Keep GitHub issue state and existing candidate branches intact. For each existing `ralph/issue-*` branch, verify the new target base is an ancestor; if not, merge/rebase it safely without discarding the candidate commits. Ralph refuses to start a ticket on a stale candidate branch.
