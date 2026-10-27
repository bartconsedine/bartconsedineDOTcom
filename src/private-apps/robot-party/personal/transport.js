import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';

const fail = reason => Object.assign(new Error('Callback verification failed.'), { code: -32015, reason });
export function signingKey(secret) {
  if (typeof secret !== 'string' || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw fail('invalid_secret');
  const key = Buffer.from(secret.slice(6), 'base64');
  if (key.length < 24 || key.length > 64 || key.toString('base64').replace(/=+$/, '') !== secret.slice(6).replace(/=+$/, '')) throw fail('invalid_secret');
  return key;
}
export function encryptionKey(value) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value || '')) throw Error('Private delivery key is unavailable.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw Error('Private delivery key is unavailable.');
  return key;
}
const binding = (channel, id, url) => JSON.stringify([channel.owner_id, channel.robot_id, channel.id, id, url]);
export function seal(secret, channel, id, url, key, previous = null) {
  signingKey(secret);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(binding(channel, id, url)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ current: secret, previous }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}
export function unseal(subscription, channel, key) {
  const bytes = Buffer.from(subscription.secret_box, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(binding(channel, subscription.id, subscription.callback_url)));
  cipher.setAuthTag(bytes.subarray(12, 28));
  const credentials = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
  signingKey(credentials.current);
  if(credentials.previous){signingKey(credentials.previous.secret);if(!Number.isFinite(credentials.previous.until))throw Error('Invalid rotation.');}
  return credentials;
}
export const subscriptionId = (channel, url) => 'rpps_' + createHash('sha256').update(binding(channel, 'personal.message.created', url)).digest('hex');
export function signedHeaders(id, body, secret, subscription, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  const secrets=typeof secret==='string'?[secret]:[secret.current,...(secret.previous&&secret.previous.until>now?[secret.previous.secret]:[])];
  const signatures=secrets.map(value=>'v1,'+createHmac('sha256', signingKey(value)).update(`${id}.${timestamp}.${body}`).digest('base64')).join(' ');
  return { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': signatures, 'X-MCP-Subscription-Id': subscription };
}
export function callbackUrl(value) {
  let url; try { url = new URL(value); } catch { throw fail('invalid_url'); }
  if (value.length > 2048 || url.protocol !== 'https:' || url.username || url.password || url.hash || url.port && url.port !== '443' || isIP(url.hostname.replace(/^\[|\]$/g, '')) || url.hostname.endsWith('.')) throw fail('invalid_url');
  return url;
}
// Reject special-use destinations, including IPv4-mapped IPv6. Restrict IPv6 to
// global unicast 2000::/3 and exclude IANA's special 2001::/23 and documentation.
export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) !== 6) return false;
  const prefix = address.toLowerCase().split(':');
  const first = parseInt(prefix[0], 16), second = parseInt(prefix[1] || '0', 16);
  return first >= 0x2000 && first <= 0x3fff && !(first === 0x2001 && second <= 0x1ff) && !(first === 0x2001 && second === 0xdb8) && first !== 0x2002 && !(first === 0x3fff && second <= 0xfff);
}
export async function safeWebhook(urlValue, body, headers, { resolve = lookup, request = https.request } = {}) {
  const url = callbackUrl(urlValue);
  let deadline;
  const addresses = await Promise.race([resolve(url.hostname, { all: true, verbatim: true }),new Promise((_resolve,reject)=>{deadline=setTimeout(()=>reject(fail('timeout')),5000);})]).finally(()=>clearTimeout(deadline));
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw fail('invalid_address');
  const chosen = addresses[0];
  // Pin the validated address. TLS uses the original hostname; redirects are
  // returned as failures rather than followed. Every connection resolves anew.
  return new Promise((resolveResponse, reject) => {
    const outgoing = request(url, { method: 'POST', headers, agent: false, servername: url.hostname, signal: AbortSignal.timeout(8000),
      lookup: (_host, options, done) => done(null, options?.all ? [chosen] : chosen.address, chosen.family),
    }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 8192) response.destroy(fail('response_too_large')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolveResponse({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    outgoing.setTimeout(8000, () => outgoing.destroy(fail('timeout')));
    outgoing.on('error', reject); outgoing.end(body);
  });
}
export async function verifyCallback(url, secret, id, send = safeWebhook) {
  callbackUrl(url); signingKey(secret);
  const challenge = randomBytes(32).toString('base64url'), eventId = 'verify_' + randomUUID();
  const body = JSON.stringify({ type: 'verification', challenge });
  const response = await send(url, body, signedHeaders(eventId, body, secret, id));
  let echoed; try { echoed = JSON.parse(response.text).challenge; } catch { throw fail('challenge_failed'); }
  if (response.status < 200 || response.status >= 300 || typeof echoed !== 'string' || Buffer.byteLength(echoed) !== Buffer.byteLength(challenge) || !timingSafeEqual(Buffer.from(echoed), Buffer.from(challenge))) throw fail('challenge_failed');
}
export async function dispatchOne(storage, key, send = safeWebhook) {
  const job = await storage.owner('claim', {});
  if (!job) return { attempted: false };
  const { message, subscription, channel } = job;
  let outcome = 'retry';
  try {
    const current = await storage.owner('snapshot', {});
    if(current.channel?.id!==channel.id || current.subscription?.id!==subscription.id || current.subscription?.secret_box!==subscription.secret_box)throw Error('Subscription changed.');
    const secret = unseal(subscription, channel, key);
    // The event intentionally carries identifiers only. Private content is
    // obtained through the grant-checked read tool, never the shared board.
    const event = { eventId: message.id, name: 'personal.message.created', timestamp: message.created_at, data: { channel_id: channel.id, message_id: message.id }, cursor: null };
    const body = JSON.stringify(event);
    const response = await send(subscription.callback_url, body, signedHeaders(message.id, body, secret, subscription.id));
    outcome = response.status >= 200 && response.status < 300 ? 'received' : response.status === 410 || response.status === 413 ? 'failed' : 'retry';
  } catch { /* No secret, callback URL or message body enters errors/logs. */ }
  const saved = await storage.owner('finish', { messageId: message.id, leaseId: job.leaseId, outcome });
  return { attempted: true, recorded: saved?.saved === true };
}
