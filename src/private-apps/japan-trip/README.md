# Japan command center

Private planning document at `/admin/apps/japan-trip`, registered in the workspace grid and sidebar. Overview shows booking deadlines, budget forecast, riding days, timing risks and editable notes. Itinerary, bookings/costs, checklist and settings are editable. “On request” means pending; only “Booked” counts as confirmed.

## Persistence and ownership

The whole plan is one small owner-scoped JSON document in Supabase `public.app_data`, slug `japan-trip`, key `plan-v1`. It uses `readAppData` / `writeAppData` and the existing signed-in session and admin/owner RLS. There are no new tables, migrations, credentials or browser persistence. Each admin has a separate plan. Temporary edits remain in React until **Save changes** succeeds. Failed reads block editing; failed saves preserve input for retry. A successful save survives a new GET/session. Unsaved edits warn on browser unload.

The latest save replaces the whole document. Use one editing tab at a time; this version does not promise concurrent editing or conflict resolution. Remove supports undo until save; undo preserves other edits. All amounts are whole-trip USD. Forecast uses actual cost (including zero) when present, otherwise the estimate, excluding “Not needed”. Null prices remain unknown and show a partial-forecast warning. Target budget is for the whole trip.

## Source and import

The canonical trip Sheet can be linked in settings, with its last-read date. It remains the authority for the planning model. The app's imported snapshot and subsequent edits persist in Supabase; there is **no automatic Google Sheets sync or writeback**. Booking evidence can supersede stale Sheet assumptions; record the discrepancy in notes and replan dependent dates/costs. Do not import obsolete domestic flights, hotels or budgets as current merely because the international dates changed.

Bart's verified account starts with his user-requested flight schedule, January 27–February 5, 2027, arrival January 28, pending airline status, and dependent replanning tasks. No flight import is required. `starter.js` is wired only through the server registry/API and is returned only for Bart when his Supabase record is absent. It is an unsaved starting draft; **Save changes** persists it. Existing records always take precedence, failed database reads never fall back to the starter, and the other admin starts empty. The schedule is original user-provided evidence, not fabricated reservations; dependent costs remain unknown. There are no writes in GET.

Use **Export current plan** for the version 1 JSON format (`model.js` defines all fields). **Import plan JSON** remains an optional transfer feature: it validates and previews a replacement; **Use this plan** changes the editor and **Save changes** persists it. Cancel leaves the editor unchanged. Export may include unsaved edits and is a transfer, never the database. Imports do not change external bookings. Recheck fares/timetables and ticket status directly with providers.

The shared `/api/admin/apps/japan-trip` GET/POST dispatcher checks admin access, exact origin and private/no-store headers; POST additionally caps the streamed body at 180 KB, validates allowed fields, dates, IDs, status, limits, amounts and HTTPS URLs before writing. Database exceptions return a generic 503. Auth/provider/schema prerequisites are the same as the existing admin workspace.

## Verification

`tests/japan-trip.test.js` covers model validation, forecast math, pending confirmations, API roundtrip/owner isolation with injected storage, direct authentication/CSRF denials, oversized payloads, and database failures. The repository RLS suite exercises the actual migration policies in PGlite, including the Japan plan key, with both admins and an unapproved identity. Run `npm run db:validate`, `npm test`, and `npm run build` before review.

Mocked storage and local PostgreSQL policy tests do not verify hosted persistence. A signed-in live check must import/save, reload, reopen in a fresh session and confirm the second admin cannot access the first admin's record. Record actual results and any access blocker in the PR. Production release requires authorization through the project PR workflow.

## Ten itinerary proposals

**Explore 10 options** compares ten authored January 27–February 5, 2027 scenarios with a geographic route map, Japan/Hokkaido zoom, location buttons, a day slider, daily proposed time windows, hotel-night totals, full riding-day counts, a riding-day filter, pros/cons and a comparison table. The overview includes a direct entry button. All eight hotel nights are accounted for; each proposal ends with a February 4 Tokyo night before the February 5 11:05 Haneda departure. Flight anchors come from the existing saved flight evidence, still marked On request. No exact domestic flight is claimed selected.

This is a **stateless comparison** of versioned planning templates against the current plan’s date anchors. It creates no editable records, saved selections, new keys, or database writes. Browsing and filters are disposable React presentation state; the existing plan, bookings and notes remain in owner-scoped Supabase. It does not adopt an itinerary or overwrite saved decisions. Dates outside the reviewed window show a mismatch message instead of silently shifting flight evidence. Database-load errors continue to block the parent app; there is no fallback to another owner’s plan or a demo record.

`options.js` keeps proposal text and schedule calculations independent of React. Travel/move days are never counted as full riding days. Times are explicitly planning windows, prices remain unknown, and sources include the 2026–27 transfer operator and official Tomamu access (checked October 26, 2026). Map lines are destination connections, not navigation routes; the bundled Natural Earth 1:50m Japan coastline is public domain. The local browser fixture uses the real explorer with date anchors only and bypasses neither production authentication nor database access.

`tests/japan-options.test.js` checks night/date coverage, distinct options, full riding counts, date mismatch, route/day/zoom synchronization and filtering. Existing API, save/retry and owner-isolation tests remain applicable; no persistence/auth contracts changed. Desktop/mobile visual checks use a local standalone fixture; hosted authenticated rendering remains a separate release check.
