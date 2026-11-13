import { createHmac, timingSafeEqual } from 'node:crypto';
import { boundedText } from '../robot-party/oauth-api.js';
import { omarchyGuide, software } from './model.js';

const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,63}$/i;
const emailId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const replyWindow = 23 * 60 * 60 * 1000;

export function supportConfig(env) {
  const { LAPTOP_SUPPORT_EMAIL: inbox, LAPTOP_SUPPORT_FROM: from, LAPTOP_SUPPORT_FORWARD: forward,
    LAPTOP_RESEND_API_KEY: apiKey, LAPTOP_RESEND_WEBHOOK_SECRET: secret } = env;
  if (![inbox, from, forward].every(value => typeof value === 'string' && senderAddress(value) === value)
    || forward.toLowerCase() === inbox.toLowerCase() || forward.toLowerCase() === from.toLowerCase()
    || !apiKey || !/^whsec_[A-Za-z0-9+/]+=*$/.test(secret ?? '')) return null;
  return { inbox, from, forward, apiKey, secret };
}

function signed(headers, body, secret, now) {
  const id = headers.get('svix-id') ?? '';
  const timestamp = headers.get('svix-timestamp') ?? '';
  const signatures = headers.get('svix-signature') ?? '';
  if (!/^[\w-]{1,128}$/.test(id) || !/^\d{1,12}$/.test(timestamp)
    || Math.abs(now - Number(timestamp) * 1000) > 300000) return false;
  const digest = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(' ').some(entry => {
    if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(entry)) return false;
    const signature = Buffer.from(entry.slice(3), 'base64');
    return timingSafeEqual(signature, digest);
  });
}

const answers = {
  setup: `Connect the charger and follow the first-boot prompts to create your own account. The official Omarchy manual is at ${omarchyGuide}. If setup stops, reply with the model and the error you see. Keep passwords and recovery keys private.`,
  office: 'LibreOffice Writer, Calc, and Impress cover documents, spreadsheets, and presentations. Open DOCX, XLSX, or PPTX files in LibreOffice and check the layout and formulas before sharing. Macros, fonts, and complex formatting may behave differently.',
  creative: `Included creative tools:\n${software.slice(1).map(([name, purpose]) => `- ${name} — ${purpose}`).join('\n')}\n\nIf you rely on Adobe project files or plugins, reply with the format and what you want to do so we can help check compatibility.`,
};

function senderAddress(value) {
  if (typeof value !== 'string' || value.length > 500 || /[\r\n]/.test(value)) return null;
  const address = (value.match(/<([^<>]+)>$/)?.[1] ?? value).trim();
  return emailPattern.test(address) && address.length <= 254 ? address : null;
}

export function createSupportWebhook({ config, fetcher = fetch, clock = Date.now }) {
  const json = (status, result) => Response.json({ result }, { status, headers: { 'Cache-Control': 'no-store' } });
  return async request => {
    if (!config) return json(503, 'unconfigured');
    const now = clock();
    let event;
    try {
      const body = await boundedText(request, 131072);
      if (!signed(request.headers, body, config.secret, now)) return json(401, 'invalid_signature');
      event = JSON.parse(body);
    } catch {
      return json(400, 'invalid_payload');
    }
    if (event?.type !== 'email.received') return json(200, 'ignored');
    const id = event.data?.email_id;
    if (typeof id !== 'string' || !emailId.test(id)) return json(400, 'invalid_email_id');
    const deliveredToInbox = recipients => Array.isArray(recipients)
      && recipients.some(address => senderAddress(address)?.toLowerCase() === config.inbox.toLowerCase());
    if (!deliveredToInbox(event.data.to)) return json(200, 'ignored');
    const headers = { Authorization: `Bearer ${config.apiKey}` };
    async function resend(path, options = {}) {
      const result = await fetcher(`https://api.resend.com${path}`, {
        ...options, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
        headers: { ...headers, ...options.headers },
      });
      if (!result.ok) throw Error('Email provider unavailable');
      return result;
    }
    async function send(kind, message) {
      await resend('/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `laptop-support/${kind}/${id}` },
        body: JSON.stringify({ from: config.from, ...message }),
      });
    }
    try {
      const received = await resend(`/emails/receiving/${id}?html_format=cid`);
      const email = JSON.parse(await boundedText(received, 4_000_000));
      if (!deliveredToInbox(email.to) || email.id !== id) return json(200, 'ignored');
      const age = now - Date.parse(email.created_at);
      if (!Number.isFinite(age) || age < -300000 || age >= replyWindow) return json(200, 'review_in_provider');
      const from = senderAddress(email.from);
      const mailHeaders = Object.fromEntries(Object.entries(email.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
      if (!from || [config.inbox, config.from, config.forward].some(address => from.toLowerCase() === address.toLowerCase())
        || /^(?:mailer-daemon|postmaster|no-?reply)@/i.test(from)
        || mailHeaders['auto-submitted'] && String(mailHeaders['auto-submitted']).toLowerCase().trim() !== 'no'
        || /^(?:bulk|list|junk)$/i.test(String(mailHeaders.precedence ?? '').trim())
        || mailHeaders['list-id'] || String(mailHeaders['return-path'] ?? '').trim() === '<>') return json(200, 'ignored');
      const subject = typeof email.subject === 'string' ? email.subject.replace(/[\r\n]/g, ' ').slice(0, 150) : '';
      const topic = subject.toLowerCase().trim();
      const verified = email.authentication?.dmarc === 'pass';
      const body = typeof email.text === 'string' ? email.text.trim().slice(0, 16000) : '';
      const hasAttachments = Array.isArray(event.data.attachments) && event.data.attachments.length > 0;
      const firstMessage = !mailHeaders['in-reply-to'] && !mailHeaders.references && !/^re\s*:/i.test(subject);
      const reply = verified && firstMessage && !hasAttachments;
      const answer = Object.hasOwn(answers, topic) ? answers[topic]
        : 'We received your message. If this is about an order, reply with the order reference from your receipt. For a technical question, include the laptop model and what you see on screen. Keep card numbers, passwords, and recovery keys private.';
      const autoHeaders = { 'Auto-Submitted': 'auto-replied', 'X-Auto-Response-Suppress': 'All' };
      const messageId = event.data.message_id;
      const threading = typeof messageId === 'string' && /^<[^<>\s]{1,250}>$/.test(messageId)
        ? { 'In-Reply-To': messageId, References: messageId } : {};
      // Keep the owner's relay even when a guide was sent. Subject lines alone
      // can't establish that an order or technical question has been resolved.
      await send('relay', {
        to: [config.forward], ...(verified ? { reply_to: from } : {}),
        subject: `[Laptop support] ${subject || '(no subject)'}`,
        headers: autoHeaders,
        text: `From: ${from}\nSender DMARC: ${verified ? 'verified' : 'unverified'}\nResend received email: ${id}\n\n${body || 'Open the original in Resend to read the message.'}${hasAttachments ? '\n\nAttachments are available in the original in Resend.' : ''}`,
      });
      if (reply) await send('reply', {
        to: [from], reply_to: config.inbox, subject: subject ? `Re: ${subject}` : 'We received your laptop support email',
        headers: { ...autoHeaders, ...threading },
        text: `${answer}\n\nReply to this email if you need more help.`,
      });
      return json(200, reply ? 'relayed_and_replied' : 'relayed');
    } catch {
      return json(503, 'retry');
    }
  };
}
