# Project board

Private Jira-style board at `/admin/apps/project-board`, registered in the existing workspace. Create/edit projects and tasks; use five status columns, priority, due date, search and reference links. Open a task to move its status. The phone layout stacks columns and expands details to the viewport. No drag-and-drop, deletion, sharing, background sync or automatic calendar writes in this first version.

## Persistence and permissions

Supabase `public.project_board_projects` and `public.project_board_tasks` are authoritative. Composite `(owner_id,id)` keys and an owner/project foreign key prevent cross-owner links. Rows have creation/update timestamps and integer revisions. Session-scoped Supabase, exact-origin shared API dispatch, server validation and owner-only site-admin RLS protect both operations and direct Data API access. App invitations do not grant access to these tables; the API explicitly rejects another owner's board. Nothing is stored in localStorage or a second service.

POST uses exactly `{op: "projects" | "tasks", value, expectedRevision}`. New rows require null revision; edits require the last returned integer revision. Atomic update predicates and a database trigger reject stale edits. UI confirms only returned saves; failure retains the open form and offers Save again. On a conflict, copy your draft, close, refresh and reconcile. GET never seeds or writes. A failed load does not turn into an empty board.

Projects: `id,title,description,source_url`. Tasks: `id,project_id,title,description,status,priority,due_date,source_url,calendar_id,event_id`. IDs are UUIDs; dates are ISO calendar dates or null. Calendar ID/event ID are both null or both present. Status is backlog/todo/in-progress/blocked/done; priority low/medium/high. The view fails explicitly beyond 1,000 projects or tasks, rather than silently dropping records.

## Existing calendar entities

Calendar companion (PR #16) uses **Google Calendar as event source of truth**, not Supabase event tables. This board stores only an optional Google `calendar_id,event_id` reference per task. The task editor reads the existing protected calendar API; its snapshot includes real events, birthday occurrences, plans and sitter/reminder entries. Calendar month controls the companion snapshot, which also includes its planning horizon. Event details refresh through its existing detail reader; missing/deleted/inaccessible events retain a reference that can be unlinked. Live labels and Google links are disposable, not replicated task data.

On a new/changed reference, the server binds the provider credential to the independently verified workspace identity using `googleSession`, checks the calendar list and fetches the actual noncancelled event. Expired/missing consent blocks that new reference; unchanged references remain editable. Connect/reconnect in Calendar companion. Task status/due-date changes never edit Google. No new OAuth scopes, credentials or ACLs are introduced.

## iMCP initial workflow

“Review iMCP setup” previews seven tasks from the user's explicit request and official project research, all in Backlog. “Add setup project” performs a single transaction through `project_board_start`, running with the signed-in user's privileges and RLS. Stable IDs and conflict-ignore make retry safe and preserve later edits. No records are seeded by migrations or GET. Adding the checklist does not install iMCP, approve permissions or verify an installed binary. Source: <https://github.com/mattt/iMCP>.

## Chat data maintenance

Dedicated-table equivalent to the reviewed JSON tooling:

```sh
node scripts/project-board-sql.mjs read bartconsedine@gmail.com
node scripts/project-board-sql.mjs write bartconsedine@gmail.com /absolute/private/change.json
```

Follow `docs/CHAT_APP_DATA.md` identity/project verification and requested-owner rules. The generated object targets only project `vgsmfbupgydafvotkold`; pass it unchanged to the connected Supabase operator. Writes require a temporary 0600 JSON transfer with exactly `kind,value,expectedRevision`, the same validators, a fresh read, and the returned revision. The SQL verifies live enrollment, confirmed nonanonymous user and matching verified Google identity; it scopes every row by owner. It cannot add/change calendar references: use the browser's Google-verified workflow for those. Preserve unrelated fields and stable IDs; require `authorized:true,saved:true,revision`, then reread. False saves require reconciliation; uncertain outcomes require readback before retrying. Delete transfer files. Never publish the privileged generator as an endpoint or request service-role credentials.

## Activation and validation

Stacked on calendar PR #16 and its #12 dependency, with current main merged to retain Robot Party and the login continuation. The callback merge preserves both fixed calendar return and Robot Party's allowlisted continuation.

Migration `20261027080423_project_board` and its checksum pin prepare the two tables, owner RLS, revision triggers and atomic starter import. **Not applied to hosted Supabase.** After code/dependency review, obtain separate schema authorization and use the existing guarded Prisma/cloud backup runbook. Do not use dashboard SQL, db push or a new migration history. No production seed/auth/access changes occurred.

Local verification: 158 tests passed, including real PostgreSQL/PGlite RLS, transaction rollback, starter retry, reload reads, cross-owner FK and stale revision behavior; API validation/error/auth/origin checks; real JSX load/edit/failure/retry/reload handlers; and both OAuth callback destinations. Prisma validation, production build and diff checks passed. Desktop and 390×844 phone **static actual-component fixtures with synthetic checklist data** were visually reviewed in native Chrome, including lower form controls. They do not establish a hosted session, live Google link, or cross-device Supabase persistence. Local screenshots are deliverables outside version control.

The full `db:verify:local` backup/restore drill is unverified: no PostgreSQL client/server tools or disposable `TEST_DATABASE_URL` are available on this host. PGlite exercises fresh migrations and the entire existing-to-new migration sequence but is not a pg_dump/Prisma recovery drill. Hosted authenticated save/reload/fresh-session, live second-admin denial, Google link/consent and deployed mobile checks remain activation checks.
