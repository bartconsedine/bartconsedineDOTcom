---
name: pr
description: Prepare or finish a change in this website repository through a branch and pull request, with documentation and relevant tests for every change. Use for the project's PR workflow, including a request phrased as /pr.
---

# Document, test, and open a PR

Treat `/pr` in a task request as the user's name for this workflow, not as a registered slash command. The explicit Codex skill invocation is `$pr`; `/skills` is the CLI picker. If the skill has not been discovered, read this file directly. See [contributor guidance](../../../CONTRIBUTING.md).

## Deliver a reviewable change

1. Read repository instructions and inspect Git status, base branch, and existing PRs. Reuse a suitable feature branch or create an isolated worktree from the intended base. Preserve other worktrees and user changes. Do not work directly on `main`.
2. Implement the requested scope. Document every change in the PR: the problem, resulting behavior, and reason for the approach. Update durable repository documentation when behavior, setup, configuration, schema, operations, or contributor workflow changes; include examples and recovery steps when useful.
3. Add or update meaningful tests for every functionality change, including regressions and security boundaries where relevant. A bug fix should demonstrate the failure it prevents. Cover success and denial/error paths, not just implementation wording. For documentation-only changes, validate links, instructions, examples, and skill metadata; explain why runtime test additions are not applicable. Do not add tautological tests merely to satisfy a file-count rule.
4. Run the applicable checks below against the final diff. Record actual commands, results, environment, and untested limits. Fix failures before declaring readiness. If credentials or services block validation, report the precise blocker and keep the affected claims unverified; do not invent successful results or bypass the check.
5. Review the complete diff for unrelated changes, credentials, authorization regressions, and documentation/test gaps. Create or update a draft PR using the repository template. Attach the PR to the task when the tool is available. Include exact validation evidence and any remaining setup or deployment steps.
6. Mark ready, merge, or publish only within the user's existing authorization, after final-head checks and repository requirements pass. Never bypass protections or use an admin override. For an authorized deployment, verify the exact deployed commit and relevant live behavior, and record the rollback target. Opening or invoking this skill alone does not authorize deployment, hosted schema writes, credential changes, or admin enrollment.

## Applicable checks

Start with the pinned Node version in `.nvmrc` and `npm ci` when dependencies are not already installed for the lockfile. Run `npm run db:validate`, `npm test`, and `npm run build`, as CI does. Add targeted checks based on the change:

- Auth/API changes: both approved accounts, unapproved identity, missing/expired session, confirmed matching verified Google identity, membership denial, cross-user data isolation, and private/no-store responses as applicable.
- Schema or database tooling: fresh installation, upgrade, RLS/grants/functions, and the isolated PostgreSQL backup/restore drill from [the database runbook](../../../docs/DATABASE_MIGRATIONS_AND_BACKUPS.md). Never edit an applied migration. Use only the approved Prisma workflow; a hosted write requires its secure connection and verified pre-migration backup. Membership enrollment remains a separate explicit grant.
- UI or routing: exercise affected public and protected flows. Report whether checks were local, HTTP-only, or browser-based; do not claim a visual review without one.
- Skill/workflow documentation: validate frontmatter and relative links, check commands against current scripts, and walk through representative requests including a failed check or unavailable credential. Record these checks rather than adding tests that assert prose strings.

End with the PR/commit, what changed, documentation and test evidence, and remaining blockers. Distinguish code shipped from hosted setup completed.
