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

1. Check `git status` and its existing `package.json`, test commands, agent instructions, and `.sandcastle/` (if any). Never replace an existing runner or project configuration blindly.
2. Copy the source repository's **tracked** `.sandcastle/` files (controller, prompts, schemas, and unit tests) into `<target>/.sandcastle/`. If the target already has that directory, reconcile file-by-file instead of overwriting it. Do not copy generated `runs/`, `worktrees/`, or lock files.
3. Keep the target's existing package metadata. If it has no `package.json`, initialize a minimal one with `npm init -y`. Install the controller's dependencies in the target (check source `package.json` for versions):

   ```sh
   npm install --save-dev @ai-hero/sandcastle@0.12.0 tsx@4.21.0 typescript@7.0.2 @types/node@24.10.1
   ```

4. Add these scripts **without removing existing scripts**:

   ```json
   {
     "scripts": {
       "ralph": "tsx .sandcastle/main.mts",
       "ralph:check": "tsx .sandcastle/main.mts --preflight",
       "test:ralph": "node --test .sandcastle/workflow-core.test.mjs .sandcastle/orchestrator-process.test.mjs"
     }
   }
   ```

   Keep the target's actual project test command. By default Ralph runs `npm test` for focused, final, and integration gates; either make `npm test` meaningful or pass explicit `--focused-test`, `--final-test`, and `--integration-test` commands at startup. In non-Node projects, these can invoke the project's native test runner.

5. Ignore only generated runtime state (`.sandcastle/runs/`, `.sandcastle/worktrees/`, `.sandcastle/orchestrator.lock/`, `node_modules/`), **not** the tracked `.sandcastle` sources or tests.
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
