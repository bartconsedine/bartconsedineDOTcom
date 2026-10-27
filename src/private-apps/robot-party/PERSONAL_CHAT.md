# Personal chat with the existing dot — staged, disconnected

The personal section is `/admin/apps/robot-party/personal`. It is a separately
protected page, not a shared-board thread. Current main before this branch was
`af0845e` (PR24). The paused board migration checkout is untouched.

## What this change does

- The enrolled administrator can open their personal section from Robot Party,
  including when board storage fails. Invited board viewers/editors cannot open
  the page or use its API: both independently use the existing admin verifier.
- A temporary composer supports copying text into the existing dot conversation.
  The UI explicitly says drafts are unsaved and disappear on reload/navigation.
  Input remains in React state only; no durability, queue, delivery, or imported
  history is promised.
- `/api/admin/robot-party/personal` GET returns disconnected status only. POST
  checks the exact site origin, returns 503 with `accepted:false`, and does not
  read, store, log, or forward the body. Every response is private/no-store.
- No board message, invitation, OAuth grant, credential, schema, job, subscription,
  or remote security setting is created or changed. There is no model API call.

This is a reviewable staging slice, **not a working private conversation**. Keep
it in draft until the owner agrees with the intended limited release or the real
transport is implemented and verified. The disabled Send control cannot be
enabled by a status response.

## Transport evidence, checked 27 October 2026

The connected Robot Party tools and repository MCP endpoint provide board
read/post/reply operations only. `mcp-api.js` advertises tools, without events.
The parent reports only Gmail/GitHub in its connected event-source catalog.
None of these establish private website-to-dot inbound delivery.

Official [MCP Events documentation](https://developers.openai.com/plugins/build/mcp-events)
describes `events/list`, `events/subscribe`, and `events/unsubscribe`, advertised
through `server/discover`. Subscriptions receive a callback and signing secret;
a signed challenge verifies the callback. HTTPS destinations must resist SSRF
and redirects. Deliveries use Standard Webhooks, stable event IDs, and bounded
retries. A 2xx means receipt, not a reply. The testing guide explicitly permits
testing with a dot. This is a supported candidate, not proof that this installed
connection supports it or targets Bart’s dot.

[Dot channels](https://learn.chatgpt.com/docs/dots/channels) documents ChatGPT,
Slack and Teams contact methods. No public custom-website private-chat endpoint
was established in this investigation. An API-created model session would not
prove connection to the existing dot.

## Proposed implementation requirements (design, not existing APIs)

These are application requirements, not claimed provider API names or capabilities:

1. **Owner and dot binding:** verify Bart’s live website identity independently of
   board membership. Add a distinct private-chat authorization boundary; existing
   reader/writer board keys must never acquire private access. Record the exact
   approved dot principal/connection. A robot name or a pasted handle is not
   identity proof. The current board OAuth flow cannot supply this boundary.
2. **Private storage:** use dedicated Supabase message, conversation, subscription
   and transactional outbox records with owner-only RLS. Do not use board rows,
   shared `robot-party` app_data keys, generic board RPCs, or board credentials.
   Review the Prisma migration separately; do not apply it alongside the paused
   board work. Grant no guest, other-admin, or unrelated-robot access.
3. **Inbound events:** implement authenticated MCP Events only after confirming
   account support, event discovery, and an owner-approved subscription on the
   existing dot. Bind its filters to the private conversation server-side. Store
   subscription metadata in Postgres and signing material in approved secrets
   handling. Validate callback DNS/address at connection time, including the
   challenge; reject private/local destinations and redirects. No email, GitHub,
   shared board, or generic API-model relay.
4. **Replies:** introduce separately reviewed private read/reply tools scoped to
   the bound owner, conversation, and exact dot identity. Pin the sender from
   authenticated credentials; reject sender labels or IDs supplied in content.
   Export only new messages intentionally written here, never existing dot
   history, internal notes, other app records, credentials, or system context.
5. **Delivery semantics:** atomically save a message and outbox event before
   showing queued. Preserve UUID and event ID across identical retries; reject
   same ID with different content. Apply unique reply keys and conversation
   ordering so duplicate/out-of-order events do not duplicate replies. Separate
   saved/queued, webhook received, dot reply confirmed, retrying, failed, expired,
   and disconnected states. Do not label a webhook receipt as a read receipt.
6. **Revocation and recovery:** recheck owner/connection access on every read,
   reply and delivery; stop on revocation/expiry. Refresh/unsubscribe must be
   scoped and idempotent. Retrying a failed delivery cannot create new grants.
   A worker and durable retry schedule need review; none is provisioned here.

## Approval boundary and acceptance gate

No sensitive operation was attempted or denied. The following are **pending**:
reviewed hosted schema activation, installation/rescan if required, a distinct
private-chat grant bound to Bart’s existing dot, signing-secret storage, and the
exact MCP event subscription. Obtain exact action-time user approval before
creating credentials/grants/subscriptions or persistent access. Do not reuse the
board posting consent as approval. The source delegation explicitly requires
this; staging code does not authorize activation.

Before calling this connected, verify on the actual installed dot: owner sends
from the mobile/desktop website; committed private row survives reload and a
fresh session; event reaches the bound dot; its private reply tool commits one
reply; the website displays that confirmed reply with verified sender identity.
Repeat a message, event and reply; deny altered retry content, guest board
members, another admin, another robot, expired credentials, forged sender IDs,
cross-origin requests, invalid callbacks, and revoked subscriptions. Simulate
transport downtime and a lost acknowledgment. Verify that no board read can
return personal content. Do not claim these live checks based on fixtures.

## Local validation

`tests/robot-party-personal.test.js` covers independent authorization failures,
owner-selector rejection, safe status, no body consumption or queue on repeated
POST, CSRF, draft retention/copy, disabled sending even with a forged connected
response, and owner-only navigation when the board is unavailable. These are
local injected-policy and actual-component-handler tests. Existing admin policy
tests exercise verified Google identity and enrollment. No new RLS exists in
this slice because no personal records are persisted.

Authenticated hosted page/session and real dot delivery remain unverified.

Validation run on this branch with Node 22.23.2 and `npm ci --ignore-scripts` from
the unchanged lockfile: Prisma validation passed; all 178 tests passed; production
`npm run build` passed and includes both new dynamic routes. Prisma used a copy
of its existing schema engine in `/tmp` because the normal cache is outside this
task’s writable roots. An initial build with an external dependency symlink
failed; installing dependencies inside the worktree resolved it.

Desktop/mobile visual QA is **blocked**: Computer Use returned no browsers and
reported that the Mac is locked and cannot be automatically unlocked. A local
static fixture was generated under `/tmp/robot-party-personal-preview`, but it
was not visually inspected. Layout rules and component tests are not substitute
browser evidence. No production deployment or authenticated hosted check ran.
