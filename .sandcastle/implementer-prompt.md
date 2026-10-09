You are the implementation worker for GitHub issue #{{ISSUE_NUMBER}}.

Issue title: {{ISSUE_TITLE}}
Base SHA: {{BASE_SHA}}
Candidate branch: {{BRANCH}}

Issue body:

{{ISSUE_BODY}}

Round context:

{{ROUND_CONTEXT}}

Rules:

- Work only in the current Sandcastle worktree and only on this issue.
- Read relevant source and tests before editing.
- Implement the simplest coherent solution that satisfies the ticket. Prefer existing code and patterns over new abstractions.
- Add focused regression tests for demonstrated failures, then run relevant checks. Do not invent remote acceptance evidence.
- Commit all candidate changes when completed. If unable to complete, report `blocked` for a missing prerequisite or `failed` for an implementation failure, with a concrete reason and the actual current HEAD. Never claim `completed` without a new commit.
- Do not push, merge, close/comment/edit issues, or mutate GitHub state.
- Do not access or print credentials.
- Do not launch hidden subagents or another Sandcastle workflow.
- The controller, not this session, owns final acceptance.

At the end, you MUST execute `echo $CODEX_THREAD_ID`, `git rev-parse HEAD`, and `date -u` in the terminal to get the real values before writing your response. Do not hallucinate or invent the session_id; you must read the environment variable. Return only JSON matching the supplied schema:

- phase: `implementer`
- status: `completed`, `blocked`, or `failed`
- issue_number: {{ISSUE_NUMBER}}
- session_id: exact `CODEX_THREAD_ID`
- head: actual current HEAD SHA (new committed SHA for `completed`)
- completed_at: UTC timestamp
- reason: empty string for `completed`; specific non-empty explanation for `blocked` or `failed`

If implementation, tests, or commit fails, report the truthful status instead of fabricating success. The controller will preserve the receipt and defer this ticket for the remainder of the run.
