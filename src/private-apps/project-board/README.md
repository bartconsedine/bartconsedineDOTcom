# Project board

The existing owner-only board at `/admin/apps/project-board` is the live editor
of the website's canonical Supabase task and job records. Google Calendar remains
authoritative for calendar events. Dot remains the initial execution and schedule
provider. This app does not run a second scheduler, migrate automations, or turn
a task's date-only due date into a scheduled execution time.

## Canonical records

Existing project and task UUIDs are preserved. All records remain owner-scoped;
another site administrator or an app guest does not gain access to this board.
Rows carry UTC creation/update timestamps and integer revisions.

| Collection | Purpose |
| --- | --- |
| `project_board_projects` | Projects and source references |
| `project_board_tasks` | Tasks, waiting and historical items, priority, due date, next action, blocker and evidence references |
| `project_board_jobs` | Dot job definitions, provider ID/revision, timezone, next action and evidence |
| `project_board_schedules` | Observed provider schedule references, timezone, expression, next scheduled UTC time and last verification |
| `project_board_runs` | A specific request and its exact parent revisions, approval requirement, observed lifecycle times and outcome evidence |
| `project_board_approvals` | Decisions bound to an exact run revision |
| `project_board_deliveries` | Separate notification/result delivery identities and scheduled, received, started, delivered and verified observations |
| `project_board_events` | Deduplicated private reply observations and conflict evidence; read-only through ordinary editors |

A missing provider ID, revision, timestamp or verified outcome remains missing.
Provider-completed history is not promoted to independently verified work. A
schedule expression saved here is an observation; editing it does not edit Dot.
Calendar references still require live Google verification when added/replaced.
Unchanged references can be retained if Google consent later expires.

Evidence references contain `label`, an HTTPS `url` (or empty when no link exists),
and UTC `observed_at` or null. They hold concise facts and source pointers, not
raw private conversations. The private candidate inventory is a temporary
operator transfer only; canonical reconciled records live in Supabase.

## Browser and chat editing

The existing session-scoped, exact-origin, private/no-store app API is retained:

- GET reads canonical collections and never dispatches, reconciles or seeds.
- POST `{op, value, expectedRevision}` saves projects, tasks, jobs, schedules,
  runs, approvals or deliveries. Creation uses null; updates compare the exact
  current integer revision atomically. Stable IDs and creation times are immutable.
- POST `{op:'reconcile'}` ingests observations from the already granted private
  channel. It does not execute actions.
- POST `{op:'dispatch',runId,id,expectedRevision}` atomically binds the exact
  request to one private message and the existing durable notification outbox.
  `id` is a stable message UUID retained for the same request.
- POST `{op:'cancel',runId,expectedRevision}` records cancellation intent. An
  in-flight action is not claimed cancelled without a provider outcome.
- POST `{op:'deliver'}` pumps one existing private notification. A received
  notification is not evidence of execution or delivery of the requested result.

The UI refreshes while visible and after reconnect/focus. Failures retain the
last snapshot with a stale/error notice and keep an open draft in React state.
Unsaved form input is temporary; it is not promised to survive closing a tab.
There is no browser-storage fallback. Read back confirmed saves after reload
and on an independent authenticated session. Missing workflow schema is an
explicit setup error while the original projects/tasks remain accessible;
ordinary database failures are errors, never substituted empty data.

Trusted chat maintenance uses the same validators and per-row revision guards:

```sh
node scripts/project-board-sql.mjs read bartconsedine@gmail.com
node scripts/project-board-sql.mjs write bartconsedine@gmail.com /absolute/private/change.json
```

Follow [the app-data operating guide](../../../docs/CHAT_APP_DATA.md). A write
transfer is a private 0600 file containing exactly `kind,value,expectedRevision`.
Generate arguments, review the requested change, execute the returned SQL
unchanged on `vgsmfbupgydafvotkold`, require `authorized:true,saved:true,revision`,
then reread. False saves require reconciliation. After a timeout read before
retrying. Do not expose the operator path as an endpoint or collect credentials.
Chat writes cannot add/change Google event links. Events are not a writable
collection. No import occurs on GET or migration.

## Existing Dot coordination

The board reuses Robot Party's owner-granted personal channel, signed MCP Events,
private read/reply tools and encrypted leased outbox. No browser bridge, new
credential, grant or subscription is provisioned. The server verifies existing
configuration and the grant/subscription again before dispatch. The database
commits message/run/delivery identity together; retries cannot create a second
request with changed content.

Action-mode requests require an approved exact run revision and matching linked
job/task revisions. Editing a proposal invalidates its approval. The only
approval-free dispatch is a fixed acknowledgment canary: user-entered instructions
are excluded, and no external action is requested.

The current private tool allows one reply per owner message. Requests explicitly
ask Dot to save that slot for its final result, not an early acknowledgment.
The structured final observation contains the stable run and event identity,
observed status, provider run ID, evidence and independently supplied scheduled,
accepted, started, completed and delivered times. Reconciliation binds it to the
original message, channel and authenticated connection. Identical events are
idempotent; changed payloads or incompatible state transitions are recorded as
conflicts/uncertainty. An unstructured reply is an uncertain observation with a
message pointer; its private prose is not copied into board records.

Accepted, started, completed and verified outcomes are distinct. A successful
outcome requires completion time and evidence. Delivery confirmation requires
its own delivered time and evidence. Notification receipt time comes only from
the matching outbox; a private reply never supplies or overwrites that time.
Result-report receipt is stored separately from its actual delivered time. Do not infer start from a webhook receipt,
delivery from acceptance, or punctuality from a planned time.

Notification retries use the same immutable event identity and the existing
bounded outbox. They are not retries of an external action. Never retry an
uncertain external effect blindly. Inspect the provider/result first; a new
attempt needs a new reviewed request and approval. Cancelling a local request
does not retract an already received provider action. Late results after a
cancellation request remain visible for reconciliation.

Stable notification identity is not a generic exactly-once guarantee for
external effects. Requests instruct Dot to inspect prior results and use a
provider's native idempotency support. If duplicate-safe execution cannot be
established, Dot must report uncertainty rather than repeat the effect. Even an
untouched notification queue cannot prove that Dot has not polled the persisted
private request; post-dispatch cancellation remains a request for reconciliation.

Outbox progress depends on an open owner page and an active finite-lived Dot
subscription. Closing it can delay notification delivery; reopening resumes
saved queued work. No exact execution timing or always-on dispatcher is promised.
The approved Text Inbox sender/source association must be verified independently;
third-party text cannot become owner authorization by appearing in a message.

## Migration and recovery

Read-only production inspection on 15 November 2026 confirmed all eleven prior
migrations through `20261101014448_morning_news_progress` applied. The old
October assertion that Project Board storage was unapplied is obsolete.

The additive `20261115173745_project_board_workflow` migration must be reviewed,
checksum-pinned and deployed through the existing main-only
[cloud migration workflow](../../../docs/CLOUD_DATABASE_MIGRATIONS.md), with a
current completed recovery point, production-database environment review and a
fresh encrypted backup/upload/download/decryption check. Never replay SQL via
connector DDL, alter applied migrations or edit ledger history. Ordinary website
rollback does not reverse this additive schema or delete canonical records.

The original optional iMCP checklist remains explicit and retry-safe; its
presence is a historical setup template, not proof that its tasks are active or
that software/permissions were installed. TV-calendar and laptop-sales releases
remain separate PRs. See the sanitized
[inventory and evidence boundaries](../../../docs/project-board-inventory.md).

## Verification

Relevant suites cover API authentication/origin checks, owner isolation, row
revisions, parent bindings, approved dispatch, duplicate/conflicting events,
cancellation and uncertainty. The database drill exercises real Prisma migration,
logical backup and restore with synthetic data in a disposable loopback cluster.
Local or injected fixtures do not establish hosted delivery, live second-owner
access or cross-device behavior. Record actual command results and hosted
acceptance evidence in the release report; unresolved checks remain explicit.

### Workspace navigation and tiled layouts

The board uses the shared workspace's dark palette and responds to its available container width, including a half-width Omarchy browser. The opening counters jump to the matching work view; work search scans titles, descriptions and next actions across the currently loaded records. Projects retain their separate task search and now provide priority filtering, clear filters, and Board/List presentation. Switching projects clears task filters so a previous project's search cannot disguise the next project's records. Filters and layout are temporary presentation state; they never write to Supabase or imply a saved preference. Task cards still open the same revision-guarded editor.

Local JSX regression tests cover switching layouts, filtering/resetting, opening the correct task from the list, empty work searches, and existing save/retry and coordination behavior. Hosted save/reload and real desktop/mobile verification are part of the repository release checks, not established by these fixtures.
