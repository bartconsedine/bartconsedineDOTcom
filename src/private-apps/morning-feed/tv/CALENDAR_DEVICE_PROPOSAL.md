# Proposed per-device Calendar agenda consent — not activated

The current paired TV capability reads only Morning signal. The existing Calendar companion uses a Google provider token from the currently signed-in owner's Supabase session (`google-session.js`); it does not have a durable server refresh credential for a TV to reuse. Making every existing pairing read Calendar would silently expand access. An owner session can already open `/admin/apps/morning-feed?view=calendar`, but `/tv` deliberately uses its limited device credential even if that browser also has a Google owner session.

## Smallest separate-device option

Prepare a phone consent page bound to one existing TV confirmation code. The verified enrolled owner selects which calendars and confirms: “Allow this TV to read the next seven days of event titles and start/end times from the calendars I select, until its existing TV session expires (at most 30 days).” No descriptions, attendees, locations, meeting links, attachments, Google tokens or calendar writes are included. Do not preselect approval, bulk upgrade devices or change Google scopes. The owner must explicitly approve that specific device. The final consent must display its exact code and expiry, selected calendars and the disclosed fields.

Use a new reviewed migration for a private device grant and its minimal agenda snapshot, with existing backup/review gates. Keep the grant false by default for existing and new pairings. Owner-only authenticated RPC publishes a sanitized snapshot after an existing verified Calendar GET; capability reads verify this specific device, live owner enrollment, expiry and nonrevocation and return only the projected fields. Browser-provided owner IDs or credentials never choose the data owner. Revoke must work independently from the feed grant; disconnect/revoke feed also removes Calendar access. No public table grants, service key or refresh credential is needed.

The TV can poll this **snapshot**, but it cannot fetch live Google events unattended with today's session-only provider token. Refresh occurs while the approved owner's connected Calendar page is open; show the actual synchronization timestamp, retain a failed refresh only with a stale warning and clear the snapshot after 24 hours without owner refresh. A permission decision must explicitly acknowledge this limit. Continuous unattended live Calendar would require a separately reviewed durable provider-credential design and is outside this minimal change.

## Pending authorization and verification

Before any hosted schema change or grant activation, the parent must obtain the exact-device consent above and use the established backup/migration process. Approval of the website layout does not authorize it. No phone approval endpoint, new database permission, device grant or Google OAuth operation is included in this release.

Required checks for a future implementation: existing device default denial, wrong-device/wrong-owner denial, verified identity/membership removal, snapshot field exclusion, consent replay/expiry, independent revocation, feed revocation cascade, 24-hour snapshot clearing, source failure/staleness, fresh/upgrade schema and backup/restore drill, followed by an actual consenting phone/TV flow.
