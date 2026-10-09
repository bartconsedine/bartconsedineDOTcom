# Adding a private app

1. Implement a component under `src/private-apps/<slug>/`. Keep secret/data access in server-only modules.
2. Add `{ slug, name, description, Component }` to the server-only registry in `src/lib/apps.js`. Slugs should use lowercase words separated by hyphens. Only register working apps.
3. The workspace lists registered apps and renders them at `/admin/apps/<slug>`. Both route and registry helpers call `requireOwner()` independently.
4. Use `readAppData(slug, key)` and `writeAppData(slug, key, value)` from `src/lib/app-data.js` for small JSON records. These helpers reject unregistered apps, verify the owner, and use the owner's session with RLS. Define more specific tables/policies when an app needs them.
5. Every new Route Handler must call `checkOwner()` before reading or mutating data and return 401/403/503 on denied access. Every Server Action must call `requireOwner()` and validate inputs. Add origin/CSRF protection for mutation APIs. Do not rely only on the admin layout.
6. Test unauthorized requests directly against APIs and Supabase, not just the hidden UI. Add app-specific validation and data-isolation tests. Keep private attachments in private Storage buckets with owner policies and short-lived signed URLs.

The initial registry is intentionally empty. There is no upload-and-execute-code feature, fake app, or browser-side authentication bypass.
