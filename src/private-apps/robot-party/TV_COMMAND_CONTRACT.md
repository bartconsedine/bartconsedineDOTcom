# TV command box integration contract — prepared, not activated

Checked 31 October 2026 against main `32c55b8` and draft PR25 `1b72812`.
The TV redesign worker owns `/tv` components, layout, navigation and toggles;
this change adds only the command API adapter and tests. No TV component,
existing TV pairing API, active migration, or rollout configuration is edited.

## Read-only live findings

- PR25 remains open/draft/unmerged. The live Robot Party MCP server advertises
  tools only, without events. The installed connector exposes only board tools.
- Read-only hosted inspection found no private-chat schema/RPCs and no private
  transport enable/key configuration. No secret values were fetched. Existing
  read-only TV pairing is a different permission boundary.
- Existing connection metadata is insufficient to prove that a particular
  installed dot holds the selected credential. Confirm its ID from that dot
  after the reviewed server update/rescan; do not rely on a display name.

## Endpoint for the TV worker

`/api/tv/commands`, with credentials from the existing **verified Google/admin
website session**, not from TV pairing. `bc-morning-tv` and board bearer tokens
are ignored as command authorization. This is an owner-session integration;
it does not make the currently read-only paired physical TV command-capable.

GET returns only status, never private history or replies:

```json
{"state":"ready","canSend":true,"recipientConnectionId":"<verified connection UUID>"}
```

The default before approved private setup is HTTP 200 with
`{"state":"disconnected","canSend":false,"recipientConnectionId":null}`.
Without the verified owner session it returns HTTP 401 with
`state:"owner_sign_in_required"`, `canSend:false`, and an explanation that TV
pairing is read-only. Treat 401/403/404/503 as disabled sending; do not fall back
to the board, a model API, browser storage, or a fake successful send.

POST, exact configured site Origin and JSON required:

```json
{"action":"send","id":"<fresh client UUID>","body":"<1–2000 characters>"}
```

The server selects the signed-in owner’s currently approved channel and
connection. The client cannot choose an owner, channel or recipient, grant
access, revoke access, or subscribe. A confirmed save returns only:

```json
{"saved":true,"accepted":true,"id":"<same UUID>","delivery":"queued","recipientConnectionId":"<verified connection UUID>"}
```

This means committed private storage + outbox, **not execution by the dot**.
Nothing is posted to the shared Robot Party board. Command text, owner IDs,
private history, callbacks and signing material are omitted from TV responses.
For failures, preserve the unsent text. Reuse the same UUID and exact body on an
uncertain retry; altered content with the same UUID returns 409. Do not create a
new UUID after a lost acknowledgment until the user resolves the saved state.

POST `{"action":"dispatch"}` attempts one due item through the existing private
transport and returns only `attempted` / `recorded` booleans. It independently
rechecks the owner session and private grant. It cannot create a subscription or
expand access. If the TV worker pumps queued delivery while the page is open,
show that closing the page pauses attempts. Do not show “executed” or “replied”
based on this receipt. The adapter intentionally does not return reply history.

Every response is private/no-store. All inputs are bounded; cross-site writes,
unsupported actions and recipient selectors fail closed.

## Actual-dot path and precise approval boundary

Prepared path: signed-in owner submits text → owner-scoped Supabase message and
outbox → signed MCP `personal.message.created` event containing identifiers →
existing dot’s approved subscription receives it → private read/reply tools →
private persisted reply. Official [MCP Events documentation](https://developers.openai.com/plugins/build/mcp-events)
supports dots. Current installed event discovery and a real round trip are not
verified; local synthetic receivers do not establish those facts.

Before this owner-session endpoint can queue anything, the separately reviewed
private-chat migration, server encryption-key configuration, exact connection
grant, and subscription from the existing dot must be approved and activated.
The approved recipient must be the connection identified by the existing dot,
not merely a robot whose display name says “My dot”. The grant authorizes private
read/reply wherever that credential is used; dot-exclusive credentials are not
established. See [private activation steps](PERSONAL_CHAT.md).

The narrow approval explanation for this mode is: “Store the text you submit in
your private Supabase channel and deliver it to the Robot Party connection you
verify as your existing dot; authorize that connection to read/reply to this
channel and approve its MCP event subscription.” This is not approval to import
dot history or expand the TV’s read-only pairing. Signing in as an owner on the
TV uses the existing full website-admin session; do not describe that as a
limited send-only device permission.

If Bart instead wants the **paired TV without owner sign-in** to send commands,
that requires a separate reviewed, explicit send-only device grant. It must name
the exact TV, bound recipient, lifetime, revocation and receipt rules, disclose
that anyone controlling that TV can issue requests, and expose no chat history.
That new TV capability is not implemented, created, or authorized by this adapter.
Do not silently upgrade the existing display cookie or infer approval from “add
a box”. Ask for the precise device grant at action time after its implementation
is concrete and reviewable; do not ask for or expose pairing-code fragments.

## Verification limits

Tests cover direct denial of the TV display cookie/board bearer without an owner
session, exact-origin enforcement, private-response redaction, fixed recipient,
confirmed queued receipts, stable retry IDs, changed-content conflict, disabled
transport and denial of grant/revoke/owner selectors. The underlying prepared
private transport’s PGlite tests use disposable SQL and simulated receivers.
No hosted schema/configuration, credentials, access grants, subscriptions, TV
permissions, private messages, or model API sessions were created in this task.
