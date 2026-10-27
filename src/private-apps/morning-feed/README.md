# Morning signal

A private morning feed at `/admin/apps/morning-feed`: editable ritual, briefing and link cards; morning intention; timezone clock; daily ritual completions; ordering and visibility; and a rotating TV display. Start empty, add your own cards, and explicitly save. No invented weather, calendar or news. Cards can link to external content, but links are not fetched, embedded or automatically synchronized.

## Data and access

One small whole-document record in existing Supabase `public.app_data`: app `morning-feed`, key `screen-v1`, schema `version: 1`. Includes title, focus, IANA timezone, rotationSeconds (10–300), and at most 24 cards. Each card has a stable id, kind, title, body, minutes, URL, visibility and last completed calendar date. Completion resets visually each day in the configured zone; this is not a history log. Screen preferences, order and completion dates are durable. Display mode, current slide and unsaved edits are temporary React state.

Use existing session-scoped `readAppData` / `compareAndWriteAppData`, with atomic revision matching for every save. Both administrator owners have separate records. Existing explicit viewer/editor grants work through the shared dispatcher and Supabase RLS; owner selection is passed through every API call and reauthorized by the helpers. Viewers can use TV mode but cannot edit. Database failures never become empty saved data. Failed saves keep current input; stale saves require copying edits and choosing **Discard edits and reload** to reconcile. Removed cards can be undone until a successful save (one removal at a time).

The API rejects unknown fields, bad URLs/credentials/protocols, invalid dates/timezones, duplicate IDs, oversized input and stale revisions. The shared dispatcher enforces live access, viewer denial, exact-origin POST and private/no-store responses. No new schema, dependency, credentials, membership or hosted configuration.

## TV use

Save on a phone or computer. Open the app and authenticate in a compatible TV browser, then choose **TV mode**; alternatively mirror a signed-in browser from a connected device. TV mode fills the viewport even where native fullscreen is unavailable. The separate **Full screen** button requests the browser's native API when supported. Arrow keys and previous/next controls navigate; Escape or **Exit TV mode** exits. Cards rotate at the saved interval. Display refreshes saved data every 30 seconds; failed refreshes visibly retain the last loaded snapshot and retry. Long content scrolls rather than being silently truncated. TV sleep, casting, pairing and remote device controls are not implemented; actual device compatibility requires the user's TV/streaming model and a physical test. TV authentication remains required.

## Chat maintenance

Use the reviewed shared contract and [chat operating guide](../../../docs/CHAT_APP_DATA.md). Generated owner-scoped SQL supports read, compare-and-write, and verification without browser automation. Do not write private content into the registry or source files.

## Verification

Run `npm run db:validate`, `npm test`, `npm run build`. App tests cover strict validation, CRUD and revision conflicts through the guarded API, load/save failure recovery, completion dates, editor actions and reload with injected storage, TV refresh/rotation and real local PostgreSQL owner isolation. Browser checks use labeled rendered fixtures where authentication is unavailable; they do not prove a hosted session. Hosted saved-state reload, a fresh authenticated session, live second-user denial and physical TV operation remain unverified until those sessions/devices are available.

On 2026-10-27, Node 22.23.2: Prisma validation passed; all 168 tests passed after integrating current main from an identical source snapshot outside OS temporary folders; production build passed. The `/private/tmp` worktree initially triggered two existing backup-directory tests because their valid-directory fixtures inherited that temporary location. Desktop, 390px phone/editor and 1920×1080 TV layouts were visually reviewed using the real component rendered with labeled sample fixtures; DOM width checks found no horizontal overflow. These checks did not use a hosted authenticated session or physical TV.
