# Adding a private app

1. Implement a component under `src/private-apps/<slug>/`. Keep secret/data access in server-only modules.
2. Import the component and add `{ slug, name, description, Component }` to the array passed to `createAppRegistry` in the server-only `src/lib/apps.js`. Slugs use lowercase words/numbers separated by hyphens, at most 80 characters. Invalid/duplicate slugs, missing components and unsupported API methods fail at registration. Only register working apps.
3. The workspace lists registered apps in its homepage and authenticated sidebar, with active-page navigation, and renders them at `/admin/apps/<slug>`. Both route and registry helpers call `requireOwner()` independently. Unknown apps return 404 after authentication. Registry listings expose only name, description and slug, never components or server configuration.
4. Use `readAppData(slug, key)` and `writeAppData(slug, key, value)` from `src/lib/app-data.js` for small JSON records. These helpers reject unregistered apps, verify the owner, and use the owner's session with RLS. Define more specific tables/policies when an app needs them.
5. Prefer the shared API entry point `/api/admin/apps/<slug>`: GET returns the app's safe metadata by default. An optional `api: { GET, POST }` registration dispatches custom handlers only after owner verification and app lookup. POST requires the exact configured `SITE_URL` origin and rejects cross-site requests. Handlers receive `(request, { owner, slug })`, must return a Web `Response`, validate their own body/query schema and size, and use guarded data helpers. Do not perform writes in GET. Every response is private/no-store, denied access returns 401/403/503, unknown apps return 404 and unsupported methods return 405. Exceptions return a generic 503 without internal details.
6. Every additional Route Handler outside that shared entry point must call `checkOwner()` before reading or mutating data and return 401/403/503 on denied access. Every Server Action must call `requireOwner()` and validate inputs. Add exact-origin/CSRF protection for mutation APIs. Do not rely only on the admin layout, proxy or browser navigation.
7. Test unauthorized requests directly against APIs and Supabase, not just the hidden UI. Add app-specific validation and data-isolation tests. Keep private attachments in private Storage buckets with owner policies and short-lived signed URLs. Existing tests exercise registry authorization, per-app API denial/CSRF/metadata/error behavior, Google owner policy, and actual PostgreSQL RLS.

## Route conventions

| Path | Purpose |
|---|---|
| `/admin` | Installed apps and empty state |
| `/admin/apps/<slug>` | Registered app component with owner checks |
| `/api/admin/apps` | Authenticated metadata list |
| `/api/admin/apps/<slug>` | Guarded metadata GET or registered GET/POST handlers |
| `src/private-apps/<slug>/` | App component, validation, actions and server modules |

For larger apps that need nested routes, add explicit App Router routes under `src/app/admin/apps/<slug>/` and guard each server entry point. Keep its registry entry so it remains discoverable in the workspace. A client component must fetch protected APIs or invoke guarded Server Actions; it cannot import the server-only registry/data modules. Never use shared caches for private responses.

The initial registry is intentionally empty. There is no upload-and-execute-code feature, fake app, or browser-side authentication bypass.
