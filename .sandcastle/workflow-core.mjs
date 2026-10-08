import { join } from "node:path";

const DEFAULTS = Object.freeze({
  baseSha: "HEAD",
  focusedTest: "npm test",
  finalTest: "npm test",
  integrationTest: "npm test",
  timeoutSeconds: 18_000,
  maxParallel: 4,
});

const SHA_RE = /^[0-9a-f]{40}$/;
const BRANCH_RE = /^(?!.*\.\.)(?!.*\/\/)(?!.*[.~^:?*\[\\])[^\s/][^\s]*[^\s/.]$/;
const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
const HARNESSES = new Set(["codex", "claude-code", "pi"]);

export function parseCliOptions(argv, env = process.env) {
  const values = {
    issueOverride: optionalPositiveInteger(env.RALPH_ISSUE, "issue"),
    baseSha: env.RALPH_BASE_SHA || DEFAULTS.baseSha,
    branchPrefix: env.RALPH_BRANCH_PREFIX || "ralph/issue-",
    maxParallel: positiveInteger(env.RALPH_MAX_PARALLEL || DEFAULTS.maxParallel, "max parallel"),
    focusedTest: env.RALPH_FOCUSED_TEST || DEFAULTS.focusedTest,
    finalTest: env.RALPH_FINAL_TEST || DEFAULTS.finalTest,
    integrationTest: env.RALPH_INTEGRATION_TEST || DEFAULTS.integrationTest,
    timeoutMs: parseTimeout(env.RALPH_TIMEOUT_SECONDS || DEFAULTS.timeoutSeconds),
    dryRun: parseBoolean(env.RALPH_DRY_RUN || env.RALPH_PREFLIGHT || "false"),
    implementer: phaseConfig("implementer", env),
    reviewer: phaseConfig("reviewer", env),
    merger: phaseConfig("merger", env),
  };

  const optionsWithValues = new Map([
    ["--issue", (v) => { values.issueOverride = positiveInteger(v, "issue"); }],
    ["--base-sha", (v) => { values.baseSha = required(v, "base SHA"); }],
    ["--branch-prefix", (v) => { values.branchPrefix = required(v, "branch prefix"); }],
    ["--max-parallel", (v) => { values.maxParallel = positiveInteger(v, "max parallel"); }],
    ["--focused-test", (v) => { values.focusedTest = required(v, "focused test"); }],
    ["--final-test", (v) => { values.finalTest = required(v, "final test"); }],
    ["--integration-test", (v) => { values.integrationTest = required(v, "integration test"); }],
    ["--timeout", (v) => { values.timeoutMs = parseTimeout(v); }],
  ]);
  for (const phase of ["implementer", "reviewer", "merger"]) {
    optionsWithValues.set(`--${phase}-harness`, (v) => { values[phase].harness = required(v, `${phase} harness`); });
    optionsWithValues.set(`--${phase}-model`, (v) => { values[phase].model = required(v, `${phase} model`); });
    optionsWithValues.set(`--${phase}-effort`, (v) => { values[phase].effort = required(v, `${phase} effort`); });
  }

  for (let i = 0; i < argv.length; i += 1) {
    const option = argv[i];
    if (option === "--dry-run" || option === "--preflight") { values.dryRun = true; continue; }
    const assign = optionsWithValues.get(option);
    if (!assign) throw new Error(`unknown option: ${option}`);
    if (++i >= argv.length) throw new Error(`missing value for ${option}`);
    assign(argv[i]);
  }

  for (const phase of ["implementer", "reviewer", "merger"]) validatePhaseConfig(phase, values[phase]);
  required(values.focusedTest, "focused test");
  required(values.finalTest, "final test");
  required(values.integrationTest, "integration test");
  if (!BRANCH_RE.test(`${values.branchPrefix}1`)) throw new Error(`invalid branch prefix: ${values.branchPrefix}`);
  return values;
}

function phaseConfig(phase, env) {
  const upper = phase.toUpperCase();
  return {
    harness: env[`RALPH_${upper}_HARNESS`] || undefined,
    model: env[`RALPH_${upper}_MODEL`] || undefined,
    effort: env[`RALPH_${upper}_EFFORT`] || undefined,
  };
}

function validatePhaseConfig(phase, config) {
  if (!config.harness || !config.model || !config.effort) {
    throw new Error(`${phase} harness, model, and effort must be explicitly routed`);
  }
  if (!HARNESSES.has(config.harness)) throw new Error(`unsupported ${phase} harness: ${config.harness}`);
  if (config.harness !== "codex") throw new Error(`${config.harness} harness is declared but not implemented in v1; use codex`);
  if (!EFFORTS.has(config.effort)) throw new Error(`unsupported ${phase} effort: ${config.effort}`);
}

export function declaredBlockerNumbers(body = "") {
  const result = new Set();
  for (const line of body.split(/\r?\n/)) {
    if (!/^\s*(blocked by|depends on)\s*:/i.test(line)) continue;
    for (const match of line.matchAll(/#(\d+)/g)) result.add(Number(match[1]));
  }
  return [...result].sort((a, b) => a - b);
}

/** @param {any[]} issues @param {any} options */
export function selectReadyIssues(issues, options = {}) {
  const { overrideNumber, maxParallel = 4 } = options;
  if (!Array.isArray(issues)) throw new Error("issue list is invalid");
  const ordered = [...issues].sort((a, b) => a.number - b.number);
  const candidates = overrideNumber === undefined ? ordered : ordered.filter((i) => i.number === overrideNumber);
  if (overrideNumber !== undefined && candidates.length === 0) throw new Error(`override issue #${overrideNumber} was not returned by GitHub`);
  const ready = candidates.filter((issue) => {
    if (String(issue.state).toUpperCase() !== "OPEN") return false;
    if (!issue.labels?.includes("ready-for-agent")) return false;
    return !issue.blockers?.some((b) => String(b.state).toUpperCase() !== "CLOSED");
  });
  if (overrideNumber !== undefined && ready.length === 0) throw new Error(`override issue #${overrideNumber} is not ready`);
  return ready.slice(0, maxParallel);
}

export function buildPhaseCommand({ harness, model, effort, worktreePath, schemaPath, receiptPath, promptPath }) {
  if (harness !== "codex") throw new Error(`${harness} harness is not implemented in v1`);
  const args = [
    "unsnooze", "_run", "codex", "--ask-for-approval", "never", "--no-alt-screen", "exec",
    "--model", model, "--config", `model_reasoning_effort=\"${effort}\"`,
    "--sandbox", "danger-full-access", "--color", "never", "--cd", worktreePath,
    "--output-schema", schemaPath, "--output-last-message", receiptPath, "-",
  ];
  return `${args.map(shellQuote).join(" ")} < ${shellQuote(promptPath)}`;
}

export function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=+-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", `'"'"'`)}'`;
}

export function roundArtifactPaths(ticketRoot, round) {
  const prefix = `round-${round}`;
  const controlDir = join(ticketRoot, "control");
  return {
    implementerPromptPath: join(controlDir, `${prefix}-implementer.md`),
    implementerSchemaPath: join(controlDir, `${prefix}-implementer-schema.json`),
    implementerReceiptPath: join(ticketRoot, `${prefix}-implementer.json`),
    implementerPanePath: join(ticketRoot, `${prefix}-implementer-pane.txt`),
    focusedTestPath: join(ticketRoot, `${prefix}-focused-test.txt`),
    reviewerPromptPath: join(controlDir, `${prefix}-reviewer.md`),
    reviewerSchemaPath: join(controlDir, `${prefix}-reviewer-schema.json`),
    reviewerReceiptPath: join(ticketRoot, `${prefix}-reviewer.json`),
    reviewerPanePath: join(ticketRoot, `${prefix}-reviewer-pane.txt`),
  };
}

export function buildImplementerRoundContext({ round, currentHead, reviewerFindings, focusedTestEvidence }) {
  if (round === 1) return "This is the initial implementation round. Create the first candidate commit.";
  return `This is correction round ${round}.\nCurrent candidate HEAD: ${currentHead}\n\nExact reviewer findings from the previous round:\n${JSON.stringify(reviewerFindings)}\n\nPrevious controller-owned focused-test evidence:\n${focusedTestEvidence.trimEnd()}\n\nCorrect these findings and create a new commit on top of the current candidate HEAD.`;
}

export function validateImplementerReceipt(receipt, expected) {
  assertRecord(receipt, "implementer receipt");
  expectEqual(receipt.phase, "implementer", "implementer phase");
  expectEqual(receipt.status, "completed", "implementer status");
  expectEqual(receipt.issue_number, expected.issueNumber, "implementer issue number");
  required(receipt.session_id, "implementer session_id");
  validateSha(receipt.head, "implementer head");
  expectEqual(receipt.head, expected.head, "implementer head");
  validateTimestamp(receipt.completed_at, "implementer completed_at");
  return receipt;
}

export function validateReviewerReceipt(receipt, expected) {
  assertRecord(receipt, "reviewer receipt");
  expectEqual(receipt.phase, "reviewer", "reviewer phase");
  expectEqual(receipt.status, "completed", "reviewer status");
  if (!["approved", "changes_requested", "blocked"].includes(receipt.verdict)) throw new Error(`invalid reviewer verdict: ${receipt.verdict}`);
  required(receipt.session_id, "reviewer session_id");
  if (receipt.session_id === expected.implementerSessionId) throw new Error("reviewer must use a fresh session");
  validateSha(receipt.reviewed_head, "reviewed head");
  expectEqual(receipt.reviewed_head, expected.reviewedHead, "reviewed head");
  validateTimestamp(receipt.completed_at, "reviewer completed_at");
  if (!Array.isArray(receipt.findings) || receipt.findings.some((x) => typeof x !== "string")) throw new Error("reviewer findings must be an array of strings");
  if (receipt.verdict === "approved" && receipt.findings.length) throw new Error("approved reviewer verdict must have no findings");
  return receipt;
}

export function validateMergerReceipt(receipt, expectedIssues) {
  assertRecord(receipt, "merger receipt");
  expectEqual(receipt.phase, "merger", "merger phase");
  expectEqual(receipt.status, "completed", "merger status");
  required(receipt.session_id, "merger session_id");
  validateSha(receipt.final_head, "merger final head");
  validateTimestamp(receipt.completed_at, "merger completed_at");
  if (!Array.isArray(receipt.results)) throw new Error("merger results must be an array");
  const expected = new Set(expectedIssues);
  const actual = new Set();
  for (const result of receipt.results) {
    if (!expected.has(result.issue_number)) throw new Error(`unexpected merger issue #${result.issue_number}`);
    if (actual.has(result.issue_number)) throw new Error(`duplicate merger issue #${result.issue_number}`);
    actual.add(result.issue_number);
    if (!["merged", "rejected"].includes(result.status)) throw new Error(`invalid merger result for #${result.issue_number}`);
    if (typeof result.detail !== "string") throw new Error("merger result detail must be a string");
  }
  if (actual.size !== expected.size) throw new Error("merger receipt does not cover every candidate");
  return receipt;
}

export function summarizeSettled(issues, settled) {
  return settled.map((outcome, index) => ({ issue: issues[index], outcome }));
}

export function successfulCandidates(summary) {
  return summary
    .filter((entry) => entry.outcome.status === "fulfilled")
    .map((entry) => entry.outcome.value);
}

function required(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must not be empty`);
  return value;
}
function positiveInteger(value, label) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}
function optionalPositiveInteger(value, label) { return value === undefined || value === "" ? undefined : positiveInteger(value, label); }
function parseTimeout(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("timeout must be a positive number of seconds");
  return Math.floor(seconds * 1000);
}
function parseBoolean(value) {
  if (["1", "true", "yes"].includes(String(value).toLowerCase())) return true;
  if (["0", "false", "no", ""].includes(String(value).toLowerCase())) return false;
  throw new Error(`invalid boolean: ${value}`);
}
function assertRecord(value, label) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`); }
function expectEqual(actual, expected, label) { if (actual !== expected) throw new Error(`${label} mismatch`); }
function validateSha(value, label) { if (typeof value !== "string" || !SHA_RE.test(value)) throw new Error(`invalid ${label}`); }
function validateTimestamp(value, label) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`invalid ${label}`); }
