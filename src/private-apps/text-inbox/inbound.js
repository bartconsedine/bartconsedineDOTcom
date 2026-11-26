import twilio from "twilio";

// Server-side transport core. The eventual route must pass a
// transaction-backed store. There is no outbound SMS path.
const maxBytes = 16_384;
const maxFields = 128;
const accountPattern = /^AC[0-9a-f]{32}$/i;
const messagePattern = /^SM[0-9a-f]{32}$/i;
const numberPattern = /^\+[1-9][0-9]{7,14}$/;
const emptyTwiml = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
const reply = (status, body = null) => new Response(body, {
  status,
  headers: { "Cache-Control": "no-store",
    ...(body ? { "Content-Type": "text/xml; charset=utf-8" } : {}) },
});

async function readParameters(request) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    return { status: 413 };
  if (!request.body) return { status: 400 };
  const reader = request.body.getReader();
  const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let size = 0;
  let raw = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        return { status: 413 };
      }
      raw += utf8.decode(value, { stream: true });
    }
    raw += utf8.decode();
    const pairs = raw.split("&");
    if (!raw || pairs.length > maxFields) return { status: 400 };
    const decode = (field) => decodeURIComponent(field.replaceAll("+", " "));
    const values = Object.create(null);
    for (const pair of pairs) {
      const index = pair.indexOf("=");
      if (index <= 0) return { status: 400 };
      const key = decode(pair.slice(0, index));
      const value = decode(pair.slice(index + 1));
      if (!/^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(key) ||
          ["constructor", "prototype"].includes(key)) return { status: 400 };
      if (!Object.hasOwn(values, key)) values[key] = value;
      else values[key] = [].concat(values[key], value);
    }
    return { values };
  } catch {
    void reader.cancel().catch(() => {});
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

/**
 * A transport-only contract, not an authorization to execute the SMS contents.
 * Store returns accepted or duplicate only after durable commit; it must
 * recheck the live sender binding and detect changed content for a reused SID.
 */
export function createInboundHandler({ webhookUrl, accountSid, destination,
  authToken, validateRequest = twilio.validateRequest, saveInbound }) {
  const url = new URL(webhookUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      url.pathname !== "/api/integrations/twilio/inbound" ||
      !accountPattern.test(accountSid) || !numberPattern.test(destination) ||
      typeof authToken !== "string" || !authToken ||
      typeof validateRequest !== "function" || typeof saveInbound !== "function")
    throw new TypeError("Incomplete Text Inbox transport configuration");

  return async function accept(request) {
    if (request.method !== "POST") return reply(405);
    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/x-www-form-urlencoded") return reply(415);
    const signature = request.headers.get("x-twilio-signature");
    if (!signature || !/^[A-Za-z0-9+/]{27}=$/.test(signature)) return reply(403);
    const { status, values } = await readParameters(request);
    if (status) return reply(status);
    try {
      // Do not rebuild, normalize or use proxy headers to select this URL.
      if (validateRequest(authToken, signature, webhookUrl, values) !== true)
        return reply(403);
    } catch {
      return reply(403);
    }

    const { AccountSid, MessageSid, From, To, NumMedia, Body } = values;
    if ([AccountSid, MessageSid, From, To, NumMedia, Body].some(v => typeof v !== "string"))
      return reply(400);
    if (AccountSid !== accountSid || To !== destination) return reply(403);
    if (!messagePattern.test(MessageSid) || !numberPattern.test(From) ||
        NumMedia !== "0" || !Body.trim() || Body.length > 4_000 || Body.includes("\0"))
      return reply(400);
    try {
      const outcome = await saveInbound({
        accountSid: AccountSid, messageSid: MessageSid, sender: From, recipient: To, body: Body,
      });
      if (outcome === "accepted" || outcome === "duplicate") return reply(200, emptyTwiml);
      if (outcome === "not_bound") return reply(403);
      if (outcome === "conflict") return reply(409);
      return reply(503);
    } catch {
      return reply(503);
    }
  };
}
