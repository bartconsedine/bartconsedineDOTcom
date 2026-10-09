// No credentials or registry entries live here. Production wiring is server-only.
export function createAppApi({ checkOwner, getApp, siteOrigin }) {
  const json = (body, status) => Response.json(body, { status });
  return async function handle(request, { params }) {
    let response;
    try {
      const access = await checkOwner();
      if (!access.ok) response = json({ error: access.reason }, access.status);
      else if (!['GET', 'POST'].includes(request.method)) response = json({ error: 'method_not_allowed' }, 405);
      else if (request.method === 'POST' && (!siteOrigin() || request.headers.get('origin') !== siteOrigin() || request.headers.get('sec-fetch-site') === 'cross-site')) response = json({ error: 'invalid_origin' }, 403);
      else {
        const { slug } = await params;
        const app = await getApp(slug);
        if (!app) response = json({ error: 'not_found' }, 404);
        else if (app.api?.[request.method]) response = await app.api[request.method](request, { owner: access.user, slug: app.slug });
        else if (request.method === 'GET') response = json({ app: { slug: app.slug, name: app.name, description: app.description } }, 200);
        else response = json({ error: 'method_not_allowed' }, 405);
      }
      if (!(response instanceof Response)) throw new Error('App handlers must return a Response');
    } catch {
      // Includes failed authorization rechecks; never return internal errors or private data.
      response = json({ error: 'unavailable' }, 503);
    }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('Pragma', 'no-cache');
    return new Response(response.body, { status: response.status, headers });
  };
}
