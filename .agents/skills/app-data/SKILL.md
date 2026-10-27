---
name: app-data
description: Read or update private workspace app records from chat through connected Supabase tools, using reviewed data contracts and conflict-safe writes.
---

# Private app records from chat

Use [the operating guide](../../../docs/CHAT_APP_DATA.md) and the app's README/model. Chat and the app edit the same Supabase records. Never edit a starter/template to update saved data.

For ordinary edits already requested, proceed without asking for a second approval. Setup alone does not authorize inventing records, purchases, Sheet edits, membership, credentials or schema changes. Bart is the default owner; another owner's records need explicit requested scope.

- Generate connector arguments with `node scripts/app-data-sql.mjs read <slug> <owner-email>`; pass the returned object unchanged to Supabase `execute_sql` on the verified website project. Zero rows means unavailable identity/enrollment; one row with null value means no saved record. Validate saved values with the shared model.
- Read immediately before editing. Preserve the exact `updated_at` as `expectedAt`, stable IDs and unrelated decisions. Make the smallest coherent requested change, following the app's evidence/provenance rules. For an absent record, use only its documented empty state or owner-specific starter.
- Prepare a temporary JSON transfer containing exactly `value` and `expectedAt` outside Git, with permissions 0600. Generate write arguments with `node scripts/app-data-sql.mjs write <slug> <owner-email> <change.json>`, review against the request and execute the generated query unchanged. Never handwrite a blind upsert or remove owner/revision guards.
- Require `authorized: true`, `saved: true` and a database revision. Denied authorization stops for the identity/enrollment prerequisite. A false save requires rereading and reconciling newer data; never blindly retry the old full document. After a timeout, reread to determine whether the write committed before retrying.
- Reread, validate and verify the intended persisted changes. Remove transfer files. Report the change and unresolved evidence discrepancies; an already open app needs a reload to see chat updates.

The authenticated connector is a trusted administrative operator path with privileges exceeding app-session RLS. Generated queries narrow that access using live membership, verified Google identity, owner/app/key and revision guards. They do not turn arbitrary SQL into an owner-authorized API. Runtime website access must retain signed-in sessions and RLS. If the connector is unavailable, report the blocker; do not ask for service-role credentials in chat or substitute browser storage.
