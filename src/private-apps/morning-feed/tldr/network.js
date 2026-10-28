import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';
const denied = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8], ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24], ['192.168.0.0',16], ['198.18.0.0',15], ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',4], ['240.0.0.0',4]]) denied.addSubnet(address, prefix);
export const publicAddress = address => isIP(address) === 4 && !denied.check(address);
export async function publicHost(host, resolver = lookup) {
  let timer;
  let addresses;
  try { addresses = await Promise.race([resolver(host, { family: 4, all: true }), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('DNS timeout.')), 4000); })]); }
  finally { clearTimeout(timer); }
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw Error('Non-public network target.');
  return addresses[0].address;
}
// DNS is checked once and that exact address is used by TLS; redirects are checked afresh.
export async function publicGet(value, { redirects = 4, resolver = lookup, transport = request } = {}) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(url.hostname)) throw Error('Unsafe source.');
  const address = await publicHost(url.hostname, resolver);
  const result = await new Promise((resolve, reject) => {
    const req = transport(url, { agent: false, lookup: (_host, options, callback) => callback(null, options?.all ? [{ address, family: 4 }] : address, 4), headers: { 'User-Agent': 'MorningSignal/1.0 (public TLDR headlines)', Accept: 'text/html' } }, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) { res.resume(); resolve({ location: res.headers.location }); return; }
      if (res.statusCode !== 200) { res.resume(); reject(Error('Source unavailable.')); return; }
      let size = 0, text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { size += Buffer.byteLength(chunk); if (size > 2_000_000) req.destroy(Error('Source too large.')); else text += chunk; });
      res.on('end', () => resolve({ text })); res.on('error', reject);
    });
    req.setTimeout(8000, () => req.destroy(Error('Source timeout.')));
    const deadline = setTimeout(() => req.destroy(Error('Source deadline.')), 10000);
    req.on('close', () => clearTimeout(deadline)); req.on('error', reject); req.end();
  });
  if (result.location) {
    if (!redirects) throw Error('Too many redirects.');
    return publicGet(new URL(result.location, url).href, { redirects: redirects - 1, resolver, transport });
  }
  return { url: url.href, text: result.text };
}
