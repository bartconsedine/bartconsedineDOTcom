<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Product direction and admin app rules

This repository is Bart's public website and private workspace for small, purpose-built apps. Expect an ongoing collection of tools for whatever tasks Bart needs. Unless the request says otherwise, build a new tool inside the existing admin workspace at `/admin/apps/<slug>`, using the shared authentication, navigation, registry, and data helpers. Keep each app focused; do not build a generic app builder or a separate service just to add a small tool.

Read [docs/ADDING_APPS.md](docs/ADDING_APPS.md) before designing or changing an admin app. Its persistence and delivery rules are requirements:

- **Supabase Postgres is the source of truth for all durable app state:** records, user-editable settings, saved drafts, progress, ordering, history needed by the app, and integration/job state. A reload or a different device must recover the user's saved state from Supabase.
- Never substitute localStorage, IndexedDB, cookies, local files, in-memory server state, mock data, or another database for durable app storage. React state may hold temporary input and presentation state. Credentials stay in approved server secrets; attachments use private Supabase Storage with database metadata.
- Use the signed-in user's Supabase session and owner-scoped RLS. Admin access does not make either admin's records shared. Sharing requires an explicit product requirement and reviewed authorization model.
- Reuse `readAppData` / `writeAppData` for small JSON records; use dedicated tables for relational or independently updated records. Follow the existing Prisma migration and cloud execution runbooks for schema changes.
- Treat the app as a visualization and editor of shared database state. Support chat-based data maintenance through reviewed contracts and [the operating guide](docs/CHAT_APP_DATA.md); use [.agents/skills/app-data/SKILL.md](.agents/skills/app-data/SKILL.md) for data requests. Guard both chat and browser writes against stale revisions.
- Validate inputs on the server, show real loading/empty/error/saving states, and only report a successful save after Supabase confirms it. Never silently fall back to browser-only or demo data when the database fails.
- Deliver a working vertical slice: registered app, protected UI and server operations, real persistence, relevant tests, and app documentation. Verify reload persistence and cross-user denial. Report blocked live checks precisely.

Keep executable component registration and static presentation defaults in code. Persist user-editable app configuration in Supabase; do not turn the registry into user-uploaded executable code. These rules govern future apps and do not imply the hosted database or admin enrollment is already configured.

## Project change workflow

Read [the permissions and completion contract](docs/AGENT_PERMISSIONS.md) before acting. Use available permissions only for the requested repository task and its verified service targets. Tool availability is not authorization. Continue authorized work through validation and delivery; report exact blockers and unfinished checks instead of claiming completion.

Never create or use Git worktrees. Use one shared working branch at a time in the regular repository checkout for every active agent. Reuse the current working branch; do not create or switch to a per-task branch. Preserve unrelated changes and existing worktrees. Use focused commits with messages explaining the task, change, and relevant context; stage only your intended files or hunks. Coordinate overlapping edits and serialize Git mutations, dependency installs, and builds. Before committing or pushing, recheck the current branch, status, and diff. Do not reset, rebase, force-push, stash, or discard another agent's work. Keep the shared branch after release; advance it safely to merged main when needed, without rewriting shared history. Whenever shipping something new, show visual confirmation; UI changes require screenshots of the actual shipped interface at relevant desktop and mobile sizes. Label preview, fixture, and unshipped evidence explicitly.

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for every repository change: use a branch and PR, document the change, add relevant functionality/regression/security tests, and report actual validation. The reusable project workflow is [.agents/skills/pr/SKILL.md](.agents/skills/pr/SKILL.md), explicitly invoked as `$pr`; `/pr` is a request shorthand, not an installed slash command.

Bart authorizes automatically merging and deploying completed, checked, scoped website changes through the normal PR and release workflow. Do not pause for a separate code-release confirmation. Always include the direct live-site link after a deployment. Required checks and protections still apply; separate hosted database, credential, membership and security-sensitive access operations retain their own authorization requirements.
