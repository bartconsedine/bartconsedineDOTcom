# Contributing

Use a feature branch and pull request for every repository change. Preserve unrelated work and use an isolated worktree when another task is active. Start PRs as drafts and make them ready only when the final diff and applicable checks have passed.

Every PR must document the problem, resulting behavior, relevant setup/operational changes, and actual validation. Add or update tests for changed functionality, regressions, and relevant security boundaries. Documentation-only changes require checks of links, instructions, examples, and metadata; explain why new runtime tests are not applicable. Never claim a check ran when it did not.

With the Node version in `.nvmrc` and dependencies installed from the lockfile, run:

```sh
npm run db:validate
npm test
npm run build
```

Add change-specific verification from [the PR skill](.agents/skills/pr/SKILL.md). Schema and database-tooling work also requires the [database recovery drill and migration runbook](docs/DATABASE_MIGRATIONS_AND_BACKUPS.md). CI does not apply hosted migrations. Passing CI is not evidence that Google OAuth, admin enrollment, hosted backup, or production recovery works.

## Invoke the project workflow

In Codex CLI or the IDE extension, use `$pr` in a request, or choose `pr` through `/skills`. The skill lives at `.agents/skills/pr/SKILL.md`, the supported repository skill location. In an existing session, if discovery has not refreshed, restart Codex or explicitly ask it to read that file and follow the workflow.

Example: `Use $pr to add this feature, document it, add relevant tests, and open a draft PR.`

`/pr` is a conversational shorthand for this project workflow, **not a custom slash command registered by these files**. There is no command parser, hook, or global configuration installed. The workflow is available to checkouts containing this commit; it does not modify other repositories or preserved older worktrees. Skill discovery and composer behavior should be verified in the user's active Codex surface before claiming the picker has loaded it.

Merge and deploy only when authorized and required checks pass, without bypassing branch protections. A request to run this workflow does not itself grant hosted database, credentials, or membership permissions.

Sources checked 9 October 2026: [OpenAI skill discovery and invocation](https://learn.chatgpt.com/docs/build-skills), [Codex CLI skill picker](https://learn.chatgpt.com/docs/developer-commands?surface=cli).
