# Calendar companion

Private planning app at `/admin/apps/calendar-companion`. It links plans to separate sitter coverage entries, keeps a sitter booking/follow-up queue, and proposes dates far enough ahead to arrange childcare. “Fill open slots” saves planning holds for the uncovered weekly target, rotating through the user's idea bank. Suggestions count active saved plans, avoid overlap including sitter buffers, and skip dates inside the booking lead time. They do not know external calendars or venue availability and do not make reservations or contact sitters.

## Data, privacy and saves

Uses the existing Supabase `public.app_data` table, owner-scoped by the signed-in admin, slug `calendar-companion`, key `planner-v1`. No migration, credentials or membership changes. Two accounts have separate records; there is no household sharing. No fixture records in production. The small bounded document (150 plans / 30 ideas / 180 KB) deliberately uses one atomic revision rather than independently updated relational rows. Chat and browser editors replace the entire document with a compare-and-write guard. Stale initial creation or stale updates return 409; recoverable edits remain visible. Download draft includes the document, any open event form, and the last read revision. Reconcile a downloaded draft manually; it is not authoritative storage and there is no import control.

`model.js` is the shared strict contract in `src/lib/app-data-contracts.js`. Runtime requests go through the existing authenticated, exact-origin, private/no-store dispatcher; data helpers recheck admin, app and owner scope. The server bounds streamed request bodies and validates the entire document before writing. Missing data gives a real empty planner. Load failures never become writable empty data. Confirmed saves use the database-returned revision. No browser storage or service role.

Settings persist IANA time zone, booking lead days, planning horizon, weekly target, preferred evening/duration and childcare buffer. Plans store UTC start/end instants, explicit coverage (`Needed`, `Asked`, `Confirmed`, `Not needed`), sitter name, notes and cancellation. Confirmed coverage requires a sitter name. DST gaps are rejected; repeated autumn wall times use the converter's first matching instant. Changing the time zone changes display and future suggestions, not saved instants. Reminders remain open until coverage is resolved or the plan ends/cancels. Cancellation can be reversed in the event editor.

## Calendar/reminders

Download `.ics` creates distinct stable-UID plan and sitter events, links sitter to plan, includes coverage buffers, and adds a transparent recurring booking reminder with a display alarm for unresolved future events. Daily recurrence runs from the booking deadline (or shortly after export for overdue items) through the event start. Cancelled plans export cancelled status. UTC event times avoid calendar time-zone interpretation differences; recurrence follows elapsed days, so a reminder's local hour can change at DST boundaries. Calendar text is escaped and folded to the 75-octet limit.

This is a private snapshot download, **not live Google Calendar synchronization or a subscription**. No email, push service, calendar OAuth, unattended planner, sitter outreach or reservation integration is configured. Importers may ignore alarms, recurrence updates or stable UIDs and may duplicate events. Import into a separate calendar where possible. Remove obsolete booking reminders after confirming/cancelling coverage, and reconcile subsequent exports. No claim of remote calendar success is based on a database save.

## Chat operations

Use the reviewed operator workflow in `docs/CHAT_APP_DATA.md` and `.agents/skills/app-data/SKILL.md`. Read via:

```sh
node scripts/app-data-sql.mjs read calendar-companion bartconsedine@gmail.com
```

For a requested data change, prepare a private 0600 temporary file with exactly `{ "value": <complete validated planner>, "expectedAt": <exact revision or null for creation> }`, then generate:

```sh
node scripts/app-data-sql.mjs write calendar-companion bartconsedine@gmail.com /private/tmp/calendar-change.json
```

Execute the generated SQL unchanged only through the verified project connector, require authorization/save confirmation and reread. Preserve unrelated fields and IDs. The connector is privileged operator access, distinct from runtime sessions. Exported `calendar-draft.json` is a recovery bundle, not this write envelope.

## Verification

Node 22.23.2. `npm run db:validate`, `npm test`, `npm run build`; dedicated model/API/UI tests cover deadlines, proposals, DST, calendar escaping/alarms, validation/size limits, auth and origin denial, database failures, retained failed input, duplicate-click lock and revision conflicts. Real local PostgreSQL via PGlite verifies calendar roundtrip, racing/stale writes and second-owner RLS denial. Local browser visual review uses rendered actual component JSX and synthetic records, with desktop and 390px phone fixtures; it is separate from the handler tests and does not demonstrate hosted storage.

Hosted authenticated save/reload/fresh-session, both-admin live denial, actual calendar importer behavior and deployed desktop/mobile checks remain unverified until an authenticated deployment is available. Requires the safe app-data infrastructure in PR #12 before this stacked PR can release. Deployment follows the project PR workflow.
