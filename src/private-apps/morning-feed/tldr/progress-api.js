import { createHash } from 'node:crypto';
import { boundedText } from '../../robot-party/oauth-api.js';
import { publicLink } from './model.js';
import { validSecret } from '../tv/api.js';

const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
export function createNewsProgressApi({ rpc, cookie, authorize, origin }) {
  async function call(action, articleId = null) {
    let secret = null;
    if (cookie) {
      const parts = (await cookie() || '').split('.');
      if (parts.length !== 2 || !parts.every(validSecret)) return reply({ state: 'denied' }, 401);
      secret = parts[0];
    } else {
      const access = await authorize();
      if (!access.ok) return reply({ state: 'denied' }, access.status);
    }
    const { data, error } = await rpc('morning_news_progress', { p_action: action, p_secret: secret, p_article_id: articleId });
    if (error) return reply({ state: error.message === 'news_progress_denied' ? 'denied' : 'unavailable' }, error.message === 'news_progress_denied' ? 403 : 503);
    if (!data || !['disabled', 'ready', 'saved'].includes(data.state)) return reply({ state: 'unavailable' }, 503);
    return reply(data);
  }
  return {
    async GET(request) {
      if (new URL(request.url).search) return reply({ error: 'No user or article selectors are accepted.' }, 400);
      try { return await call('list'); } catch { return reply({ state: 'unavailable' }, 503); }
    },
    async POST(request) {
      if (!origin() || request.headers.get('origin') !== origin() || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Invalid origin.' }, 403);
      let id;
      try {
        if (new URL(request.url).search || request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw Error();
        const body = JSON.parse(await boundedText(request, 4096));
        if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'action,url' || body.action !== 'read') throw Error();
        const url = publicLink(body.url);
        if (!url) throw Error();
        id = createHash('sha256').update(url).digest('hex');
      } catch { return reply({ error: 'Invalid article read.' }, 400); }
      try { return await call('read', id); } catch { return reply({ state: 'unavailable' }, 503); }
    },
  };
}
