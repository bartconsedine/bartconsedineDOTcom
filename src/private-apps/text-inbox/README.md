# Text Inbox (local implementation checkpoint)

This directory currently has the isolated inbound transport core only. It is
not registered in the admin or attached to a live webhook. Nothing sends SMS.
The core defaults to the pinned official Twilio SDK validator. The eventual
webhook must inject a restricted transaction-backed store. The exact configured HTTPS URL, including
its untouched query string, must match Twilio's setting.

The store must recheck the live verified sender binding and atomically retain
one inbound message, linked request, and dispatch intent. It reports an
idempotent duplicate only for the same account, message SID, and original data.
An altered repeat is a conflict; missing/revoked bindings are refused. A
successful transport response is not proof of dot delivery or task completion.

Local transport tests: `node --test tests/text-inbox-inbound.test.js`.
Production prerequisites: checked release, completed Supabase restore point,
fresh verified encrypted backup, reviewed migration and narrow server roles,
and separately verified Twilio inbound routing. Before calling the feature live,
test real inbound, background delivery with all admin tabs closed and a
correlated result in the owner-only inbox. Leave outbound SMS off.
