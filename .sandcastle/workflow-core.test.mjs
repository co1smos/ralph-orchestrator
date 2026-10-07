import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImplementerRoundContext,
  buildPhaseCommand,
  declaredBlockerNumbers,
  parseCliOptions,
  roundArtifactPaths,
  selectReadyIssues,
  summarizeSettled,
  validateImplementerReceipt,
  validateMergerReceipt,
  validateReviewerReceipt,
} from "./workflow-core.mjs";

const routingEnv = {
  RALPH_IMPLEMENTER_HARNESS: "codex",
  RALPH_IMPLEMENTER_MODEL: "gpt-6-luna",
  RALPH_IMPLEMENTER_EFFORT: "max",
  RALPH_REVIEWER_HARNESS: "codex",
  RALPH_REVIEWER_MODEL: "gpt-6-astra",
  RALPH_REVIEWER_EFFORT: "medium",
  RALPH_MERGER_HARNESS: "codex",
  RALPH_MERGER_MODEL: "gpt-6-luna",
  RALPH_MERGER_EFFORT: "high",
};

test("parseCliOptions requires explicit routing for all phases", () => {
  assert.throws(() => parseCliOptions([], {}), /implementer harness, model, and effort/);
  const options = parseCliOptions([], routingEnv);
  assert.deepEqual(options.implementer, { harness: "codex", model: "gpt-6-luna", effort: "max" });
  assert.deepEqual(options.reviewer, { harness: "codex", model: "gpt-6-astra", effort: "medium" });
  assert.deepEqual(options.merger, { harness: "codex", model: "gpt-6-luna", effort: "high" });
  assert.equal(options.maxParallel, 4);
});

test("CLI phase routing overrides env", () => {
  const options = parseCliOptions([
    "--implementer-model", "gpt-6-sol", "--reviewer-effort", "high",
    "--merger-model", "gpt-6-astra", "--max-parallel", "2", "--preflight",
  ], routingEnv);
  assert.equal(options.implementer.model, "gpt-6-sol");
  assert.equal(options.reviewer.effort, "high");
  assert.equal(options.merger.model, "gpt-6-astra");
  assert.equal(options.maxParallel, 2);
  assert.equal(options.dryRun, true);
});

test("v1 rejects declared but unimplemented harnesses cleanly", () => {
  assert.throws(() => parseCliOptions([], { ...routingEnv, RALPH_REVIEWER_HARNESS: "pi" }), /pi harness is declared but not implemented in v1/);
  assert.throws(() => parseCliOptions([], { ...routingEnv, RALPH_IMPLEMENTER_HARNESS: "claude-code" }), /claude-code harness is declared but not implemented in v1/);
});

test("declaredBlockerNumbers extracts fallback blocker declarations", () => {
  assert.deepEqual(declaredBlockerNumbers("Blocked by: #3, #7\nDepends on: #9\nfoo #11"), [3, 7, 9]);
});

function issue(number, { state = "OPEN", labels = ["ready-for-agent"], blockers = [] } = {}) {
  return { number, title: `Issue ${number}`, state, labels, blockers };
}

test("selectReadyIssues returns deterministic ready frontier up to max parallel", () => {
  const issues = [
    issue(9), issue(2), issue(5, { blockers: [{ number: 1, state: "OPEN" }] }),
    issue(1, { state: "CLOSED" }), issue(7, { labels: [] }), issue(3),
  ];
  assert.deepEqual(selectReadyIssues(issues, { maxParallel: 2 }).map((x) => x.number), [2, 3]);
  assert.deepEqual(selectReadyIssues(issues, { maxParallel: 5 }).map((x) => x.number), [2, 3, 9]);
});

test("selectReadyIssues supports a single issue override", () => {
  assert.deepEqual(selectReadyIssues([issue(2), issue(3)], { overrideNumber: 3 }).map((x) => x.number), [3]);
  assert.throws(() => selectReadyIssues([issue(2), issue(3, { labels: [] })], { overrideNumber: 3 }), /not ready/);
});

test("buildPhaseCommand builds a visible Codex/Unsnooze noninteractive command", () => {
  const command = buildPhaseCommand({
    harness: "codex", model: "gpt-6-luna", effort: "high",
    worktreePath: "/tmp/w t", schemaPath: "/tmp/schema.json", receiptPath: "/tmp/receipt.json", promptPath: "/tmp/prompt.md",
  });
  assert.match(command, /^unsnooze _run codex /);
  assert.match(command, /--model gpt-6-luna/);
  assert.match(command, /model_reasoning_effort/);
  assert.match(command, /--output-last-message/);
  assert.match(command, /< \/tmp\/prompt\.md$/);
});

test("round artifacts remain distinct across correction rounds", () => {
  assert.notDeepEqual(roundArtifactPaths("/tmp/t", 1), roundArtifactPaths("/tmp/t", 2));
});

test("correction context contains exact review/test evidence", () => {
  const text = buildImplementerRoundContext({ round: 2, currentHead: "abc", reviewerFindings: ["fix edge"], focusedTestEvidence: "FAIL x" });
  assert.match(text, /fix edge/);
  assert.match(text, /FAIL x/);
  assert.match(text, /abc/);
});

test("implementer and reviewer receipts enforce core contracts", () => {
  const head = "a".repeat(40);
  validateImplementerReceipt({ phase: "implementer", status: "completed", issue_number: 4, session_id: "session-a", head, completed_at: new Date().toISOString() }, { issueNumber: 4, head });
  validateReviewerReceipt({ phase: "reviewer", status: "completed", verdict: "approved", session_id: "session-b", reviewed_head: head, completed_at: new Date().toISOString(), findings: [] }, { reviewedHead: head, implementerSessionId: "session-a" });
});

test("validateMergerReceipt requires exactly one result per candidate", () => {
  const receipt = {
    phase: "merger", status: "completed", session_id: "merge-session", final_head: "b".repeat(40), completed_at: new Date().toISOString(),
    results: [{ issue_number: 2, status: "merged", detail: "ok" }, { issue_number: 5, status: "rejected", detail: "conflict" }],
  };
  assert.equal(validateMergerReceipt(receipt, [2, 5]), receipt);
  assert.throws(() => validateMergerReceipt({ ...receipt, results: receipt.results.slice(0, 1) }, [2, 5]), /does not cover every candidate/);
});

test("summarizeSettled preserves ticket/outcome alignment without sibling cancellation", async () => {
  const issues = [issue(2), issue(3), issue(9)];
  const settled = await Promise.allSettled([
    Promise.resolve({ head: "a" }), Promise.reject(new Error("boom")), Promise.resolve({ head: "c" }),
  ]);
  const summary = summarizeSettled(issues, settled);
  assert.deepEqual(summary.map((x) => [x.issue.number, x.outcome.status]), [[2, "fulfilled"], [3, "rejected"], [9, "fulfilled"]]);
});
