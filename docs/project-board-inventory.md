# Project board and execution-provider inventory

Inspection and bounded verification on 15 November 2026. This document contains implementation
and verification evidence only. Private backlog details, conversation text,
credentials, callback addresses and signing material do not belong in Git.
The database remains the only canonical application record store.

## Existing production capabilities

- The [production project board](https://bartconsedine.com/admin/apps/project-board)
  loaded through an existing owner-authenticated browser session. Its project
  selection was empty and its empty state rendered without a load error. This
  establishes a working authenticated read, not a write/reload or isolation test.
- The installed Robot Party connection's Identify operation succeeded as an
  eligible owner-writer. Its private read operation succeeded with an existing
  granted channel and zero messages. Connection identity is credential identity;
  it does not establish that only a Dot can use that credential.
- The [Dot scheduled-task UI](https://chatgpt.com/scheduled) displayed twenty active,
  twelve paused and eight completed automation entries. All three visible
  sections were inventoried into a protected operator transfer outside Git.
  Provider completion labels are historical provider state, not
  independently verified task outcomes.
- The inspected existing private-request automation was active and configured
  for Robot Party's `personal.message.created` event. It uses private read/reply
  tools, requires sender verification and approved input-source association,
  excludes shared-board disclosure and forbids SMS replies. Reuse this executor;
  do not silently create another event consumer or scheduler.
- An existing recurring computer-task reminder was active, displayed as daily
  at 9:00 AM, with Eastern time shown in its settings. Its task list referenced
  an older computer setup. Those items require current evidence before becoming
  active board tasks. The exact
  full provider recurrence encoding, IANA timezone, automation ID and revision
  were not exposed by the inspected controls and must not be invented.

The earlier setup descriptions in
[PERSONAL_CHAT.md](../src/private-apps/robot-party/PERSONAL_CHAT.md),
[TV_COMMAND_CONTRACT.md](../src/private-apps/robot-party/TV_COMMAND_CONTRACT.md)
and the [Robot Party README](../src/private-apps/robot-party/README.md)
contain dated claims that private access was not activated. The live private
read and existing event automation supersede those claims for this inspection.
Do not replay setup, rotate credentials, create grants or change subscriptions
based on those older statements.

## Existing supported integration

The supported route is the authenticated owner API, an atomic Supabase private
message/outbox commit, signed MCP identifier events, the granted connection's
private read/reply tools, and a persisted private reply. The implementation is
in [personal/mcp.js](../src/private-apps/robot-party/personal/mcp.js),
[personal/transport.js](../src/private-apps/robot-party/personal/transport.js)
and the reviewed
[personal-chat migration](../prisma/migrations/20261031225622_robot_party_personal_chat/migration.sql).

Existing protections include stable message/event IDs, identical retry
recognition, changed-content conflicts, one reply per owner message, grant
checks, encrypted callback secrets, leased dispatch attempts and bounded event
retries. An HTTP callback receipt establishes event acceptance only. A private
reply establishes a recorded reply only. Neither proves an external action
completed. Outbox dispatch runs while the owner page is open; closing it pauses
attempts and reopening resumes durable pending records. No background execution
service was provisioned by this code.

## Reconciliation rules

Keep projects, actionable tasks, provider job definitions, schedules, runs,
decisions and delivery evidence distinct. Treat historical setup instructions
and provider-completed entries as history until current evidence supports a
next action. Preserve source IDs and revisions exactly; a title is not a stable
provider identity. Store missing identities and uncertain outcomes explicitly.
Do not deduplicate or bind automations by display name alone.

The private candidate inventory is an operator transfer, not a repository data
file or an alternate source of truth. Reconciliation must write through reviewed
owner-scoped contracts with fresh revisions and readback. A date-only task due
date must never drive scheduling. Dot retains execution scheduling and Google
Calendar retains event ownership; the board records references and observations.

## Unverified or blocked at this inspection

- No generic Dot automation list/control tool was exposed. Plugin discovery for
  Dot automations and Text Inbox found no relevant installed integration.
  Existing UI reads do not authorize an undocumented provider API or browser
  bridge. Automation IDs, revisions, full recurrence rules and run metadata
  remain unresolved for the visible entries. DOM accessibility identifiers are
  presentation identifiers and were not substituted for provider IDs.
- The private-request automation refers to an approved Text Inbox, but the
  inspected repository, local task evidence, available Sites listing and Page
  title search did not identify its deployed application/source or verified
  sender association. Those searches do not prove the source is absent. Do not
  create a replacement or accept third-party input as owner authorization.
- The earlier Barton Chrome registration stopped working during this inspection.
  The concurrently updated local access skill identified the already installed
  official Microsoft Playwright extension route. Its existing profile launcher
  restored owner-authenticated browser access after narrowly approved loopback
  execution. No debugging configuration, token, credential or browser permission
  was changed; the obsolete auto-connect route was not re-enabled.
- One approved harmless owner-session acknowledgement canary was submitted
  exactly once through the existing private website UI. The private tool read
  confirmed its committed row. Database inspection confirmed one callback attempt
  received by the provider. No private reply was confirmed at this checkpoint;
  the canary must remain accepted/awaiting outcome and must not be resent blindly.
  A completed website-to-Dot-to-website exchange, fresh-session persistence,
  second-owner isolation, cancellation and uncertain-delivery recovery require
  their own confirming results. They were not demonstrated by this inventory.
- Local prior timing-test evidence records an early provider start and a later
  observed delivery while provider result fields remained unknown. Preserve
  scheduled, started and delivered timestamps separately. Do not promise exact
  timing or infer delivery from provider acceptance.

## Hosted recovery checkpoint

After the owner signed in, read-only inspection of the existing Supabase
project `vgsmfbupgydafvotkold` / `bartconsedine-website` / `main` showed a latest
restorable Physical backup at **2026-11-15T08:12:01Z**, with an enabled Restore
control and no pending/failure label. Eight restore entries were visible for
8–15 November; the oldest shown was **2026-11-08T08:09:01Z**. The page did not
display an explicit retention-policy field; the visible restore-point window
must not be reported as a verified retention configuration. The Point in Time
tab offered enabling the add-on, so PITR was not enabled. No Restore or settings
operation was performed. A fresh encrypted logical backup and the guarded
migration workflow remain separate requirements.

No private conversation history was imported. Apart from the explicitly approved
synthetic private acknowledgement, no message was sent, and no automation,
subscription, access grant, credential or calendar event was changed.
