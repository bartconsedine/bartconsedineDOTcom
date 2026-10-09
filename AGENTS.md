<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project change workflow

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for every repository change: use a branch and PR, document the change, add relevant functionality/regression/security tests, and report actual validation. The reusable project workflow is [.agents/skills/pr/SKILL.md](.agents/skills/pr/SKILL.md), explicitly invoked as `$pr`; `/pr` is a request shorthand, not an installed slash command.
