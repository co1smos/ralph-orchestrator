---
name: ralph-setup
description: Interview a user and set up Ralph Orchestrator in their GitHub project, using any coding agent as the installer. Use when installing Ralph, choosing implementer/reviewer/merger worker harnesses and models, or adapting Ralph's source for a worker other than its built-in Codex CLI. Inspect preferences, make only necessary source changes, validate them, and hand off to the AFK operator.
---

# Ralph Setup

A Codex, Claude Code, Pi, or other coding agent can **perform the setup**. That does not mean Ralph can run that agent as a **worker**: upstream Ralph v1 supports Codex CLI workers only. Clone or open [the Ralph source repository](https://github.com/co1smos/ralph-orchestrator), read its `INSTALL.md`, and inspect the current source before changing anything.

## 1. Interview for the missing choices

Ask briefly, in one pass where practical:
- **Target:** Which GitHub repository should Ralph operate in? Is Ralph already installed? Confirm the local checkout and existing test commands.
- **Workers:** Which CLI/harness and model should the **implementer, reviewer, and merger** use? Ask for effort levels only where the CLI supports them. Offer to reuse one configuration across roles.
- **Execution:** Which supported models/accounts are already authenticated? Are there repository-specific constraints on tests, read-only review, data access, costs, or external side effects?

Do not ask the user to paste credentials. Do not interview about choices already answered in the repository or conversation. Explain that the agent doing this setup can be different from Ralph's worker CLI.

## 2. Choose the smallest path

- **Codex workers with usable models:** Configure the existing role flags and install via `INSTALL.md`; **do not edit the controller just because the caller is Claude or Pi**. Check the installed Codex CLI for real model availability; a ChatGPT plan alone does not establish CLI access. If a desired model already works through the user's Codex provider configuration, prefer that to a new worker adapter.
- **Other workers or models not supported by the installed Codex CLI:** Customize a working branch/copy of Ralph's source for **only the requested roles and CLI(s)**, then install that tested version into the target repository. Do not imply upstream supports arbitrary workers out of the box or add a speculative universal plugin layer.

For custom workers, inspect `src/workflow-core.mjs` (role routing, validation, `buildPhaseCommand`, receipts), `src/main.mts` (launch, Herdr panes, isolation, timeouts), role prompts, schemas, and tests. Adapt the CLI invocation and result collection to the actual worker's documented interface; avoid guessing flags. Preserve the controller's **structured JSON receipts and strict validation**, independent read-only reviewer, candidate HEAD checks, test gates, correction loop, merger, and owned-pane cleanup. Provide a verifiable session identity for each independent worker; if the new CLI cannot guarantee required semantics, explain the blocker rather than fabricating compatibility.

## 3. Prove the setup before running tickets

Check required dependencies/auth without exposing secrets. Run Ralph tests, TypeScript checks, and the target repository's offline tests, adding narrowly scoped tests for changed routing/worker execution and receipts. Demonstrate a test worker's complete implement → review/correction → merge flow in a disposable test repository or fixture before declaring a new harness supported.

Preserve existing config, Git branches, and WIP. Commit the installation/customization on a reviewable branch; don't push, merge, spend money, or execute real tickets without applicable authorization. Report the exact worker/model mapping, edited files, validation evidence, remaining limits, and reproducible preflight/start commands. Hand off **actual execution** to `skills/ralph-afk-operator/SKILL.md` from the Ralph source checkout; setup itself is not the long-running monitor.
