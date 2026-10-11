# Japan command center

Private planning document at `/admin/apps/japan-trip`, registered in the workspace grid and sidebar. Overview shows booking deadlines, budget forecast, riding days, timing risks and editable notes. Itinerary, bookings/costs, checklist and settings are editable. “On request” means pending; only “Booked” counts as confirmed.

## Persistence and ownership

The whole plan is one small owner-scoped JSON document in Supabase `public.app_data`, slug `japan-trip`, key `plan-v1`. It uses `readAppData` / `compareAndWriteAppData` and the existing signed-in session and admin/owner RLS. There are no new tables, migrations, credentials or browser persistence. Each admin has a separate plan. Temporary edits remain in React until **Save changes** succeeds. Failed reads block editing; failed saves preserve input for retry. A successful save survives a new GET/session. Unsaved edits warn on browser unload.

The app and chat edit the same document. Every save atomically checks the revision from its latest read, including insert-if-absent for new plans. A stale save returns 409 and preserves the editor input; export it before reloading and reconciling. Successful saves return the actual persisted timestamp. This prevents lost updates but does not merge simultaneous edits. See [chat data operations](../../../docs/CHAT_APP_DATA.md) for the supported connector workflow. Remove supports undo until save; undo preserves other edits. All amounts are whole-trip USD. Forecast uses actual cost (including zero) when present, otherwise the estimate, excluding “Not needed”. Null prices remain unknown and show a partial-forecast warning. Target budget is for the whole trip.

## Source and import

The canonical trip Sheet can be linked in settings, with its last-read date. It remains the authority for the planning model. The app's imported snapshot and subsequent edits persist in Supabase; there is **no automatic Google Sheets sync or writeback**. Booking evidence can supersede stale Sheet assumptions; record the discrepancy in notes and replan dependent dates/costs. Do not import obsolete domestic flights, hotels or budgets as current merely because the international dates changed.

Bart's verified account starts with his user-requested flight schedule, January 27–February 5, 2027, arrival January 28, pending airline status, and dependent replanning tasks. No flight import is required. `starter.js` is wired only through the server registry/API and is returned only for Bart when his Supabase record is absent. It is an unsaved starting draft; **Save changes** persists it. Existing records always take precedence, failed database reads never fall back to the starter, and the other admin starts empty. The schedule is original user-provided evidence, not fabricated reservations; dependent costs remain unknown. There are no writes in GET.

Use **Export current plan** for the version 1 JSON format (`model.js` defines all fields). **Import plan JSON** remains an optional transfer feature: it validates and previews a replacement; **Use this plan** changes the editor and **Save changes** persists it. Cancel leaves the editor unchanged. Export may include unsaved edits and is a transfer, never the database. Imports do not change external bookings. Recheck fares/timetables and ticket status directly with providers.

The shared `/api/admin/apps/japan-trip` GET/POST dispatcher checks admin access, exact origin and private/no-store headers; POST accepts `{ plan, expectedAt }`, validates the revision, and additionally caps the streamed body at 180 KB, validates allowed fields, dates, IDs, status, limits, amounts and HTTPS URLs before writing. Database exceptions return a generic 503. Auth/provider/schema prerequisites are the same as the existing admin workspace.

## Verification

`tests/japan-trip.test.js` covers model validation, forecast math, pending confirmations, API roundtrip/owner isolation with injected storage, stale revisions and creation conflicts, direct authentication/CSRF denials, oversized payloads, and database failures. `tests/chat-app-data.test.js` executes generated chat SQL and atomic session writes against local PostgreSQL, including scope, escaping, conflicts and verified-identity denial. The repository RLS suite exercises the actual migration policies in PGlite, including the Japan plan key, with both admins and an unapproved identity. Run `npm run db:validate`, `npm test`, and `npm run build` before review.

Mocked storage and local PostgreSQL policy tests do not verify hosted persistence. A signed-in live check must import/save, reload, reopen in a fresh session and confirm the second admin cannot access the first admin's record. Record actual results and any access blocker in the PR. Production release requires authorization through the project PR workflow.
