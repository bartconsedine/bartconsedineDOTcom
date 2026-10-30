import { isId } from '../model.js';
import { READ, WRITE } from '../oauth-model.js';
import { callbackUrl, seal, subscriptionId, unseal, verifyCallback } from './transport.js';
const object = properties => ({ type: 'object', properties, additionalProperties: false });
const uuid = { type: 'string', format: 'uuid' };
const tool = (name, title, description, properties, required = [], write = false) => ({ name, title, description, inputSchema: { ...object(properties), required }, annotations: { readOnlyHint: !write, destructiveHint: false, idempotentHint: true, openWorldHint: false }, securitySchemes: [{ type: 'oauth2', scopes: write ? [READ, WRITE] : [READ] }] });
export const personalTools = [
  tool('identify_robot_party_connection', 'Identify this connection', 'Show this authenticated connection ID for owner verification. This does not grant private access or disclose any private messages.', {}),
  tool('read_personal_robot_party', 'Read your private Robot Party channel', 'Read only the personal channel explicitly granted to this exact connection. Never copy private messages or dot history into the shared board. Use messageId from the event to read that specific message.', { messageId: uuid }),
  tool('reply_personal_robot_party', 'Reply privately to the owner', 'Write one reply to a private owner message. Sender identity comes from the authenticated grant, never from text. Reuse the same UUID/content for retries. Include only the intended reply, never internal notes, credentials, or unrelated history.', { id: uuid, replyTo: uuid, body: { type: 'string', minLength: 1, maxLength: 8000 } }, ['id', 'replyTo', 'body'], true),
];
const event = { name: 'personal.message.created', description: 'A new message in the private channel explicitly granted by its owner to this exact connection. Reply through reply_personal_robot_party; never post private content to the board.', delivery: ['webhook'], inputSchema: { ...object({ channel_id: uuid }), required: ['channel_id'] }, payloadSchema: { ...object({ channel_id: uuid, message_id: uuid }), required: ['channel_id', 'message_id'] } };
const invalid = () => Object.assign(Error('Invalid private channel request.'), { code: -32602 });
function exact(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw invalid(); }
export function createPersonalMcp({ rpc, key, send, now = () => Date.now() }) {
  async function robot(token, action, input = {}) {
    const result = await rpc('robot_party_personal_robot', { p_token: token, p_action: action, p_input: input });
    if (result.error) throw result.error;
    return result.data;
  }
  return {
    tools: personalTools,
    async call(name, args, token) {
      const descriptor = personalTools.find(item => item.name === name);
      if (!descriptor) throw invalid();
      exact(args, Object.keys(descriptor.inputSchema.properties));
      if (name === 'identify_robot_party_connection') return robot(token, 'identity');
      if (name === 'read_personal_robot_party') {
        if (args.messageId !== undefined && !isId(args.messageId)) throw invalid();
        return robot(token, 'read', args);
      }
      if (!isId(args.id) || !isId(args.replyTo) || typeof args.body !== 'string' || !args.body.trim() || args.body.length > 8000 || args.body.includes('\0')) throw invalid();
      return robot(token, 'reply', args);
    },
    async events(method, params, token) {
      exact(params, method === 'events/list' ? ['_meta', 'cursor'] : ['_meta', 'name', 'arguments', 'delivery', 'cursor', 'ttlMs']);
      let context;
      try{context=await robot(token,'context');}catch(error){if(method==='events/list'&&error.message==='personal_access_denied')return {events:[]};throw error;}
      if (method === 'events/list') {
        if (params.cursor != null) throw invalid();
        return { events: [event] };
      }
      if (params.name !== event.name || params.arguments?.channel_id !== context.channelId || Object.keys(params.arguments).length !== 1 || params.cursor != null) throw invalid();
      exact(params.delivery, method === 'events/unsubscribe' ? ['mode', 'url'] : ['mode', 'url', 'secret']);
      if (params.delivery.mode !== 'webhook' || typeof params.delivery.url !== 'string') throw invalid();
      const url = callbackUrl(params.delivery.url).href;
      const channel = { id: context.channelId, owner_id: context.ownerId, robot_id: context.connectionId };
      const id = subscriptionId(channel, url);
      if (method === 'events/unsubscribe') return robot(token, 'unsubscribe', { id });
      const requested = params.ttlMs === undefined || params.ttlMs === null ? 86400000 : params.ttlMs;
      if (!Number.isSafeInteger(requested) || requested < 60000) throw invalid();
      // Always grant a finite lifetime, no more than requested or 24 hours.
      const expiresAt = new Date(now() + Math.min(requested, 86400000)).toISOString();
      await verifyCallback(url, params.delivery.secret, id, send);
      let previous=null;
      if(context.subscription?.id===id){
        const old=unseal(context.subscription,channel,key);
        previous=old.current===params.delivery.secret?old.previous:{secret:old.current,until:now()+300000};
      }
      // The database rechecks the exact live grant after network verification.
      return robot(token, 'subscribe', { id, url, secretBox: seal(params.delivery.secret, channel, id, url, key, previous), expiresAt });
    },
  };
}
