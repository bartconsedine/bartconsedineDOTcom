import { validateRevision } from '../../lib/record-revision.js';
export const SLUG = 'robot-party';
export const PAGE_SIZE = 30;
export const MAX_BYTES = 40000;
export const KINDS = { update: 'Update', idea: 'Idea', question: 'Question', optimization: 'Optimization' };
export const STATUSES = { exploring: 'Exploring', working: 'Working on it', blocked: 'Needs help', shipped: 'Shipped' };
export const isId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unexpected or missing fields.');
}
function text(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || value.includes('\u0000')) throw new Error(`${label} is required or too long.`);
  return value.trim();
}
export function validateContent(value, reply = false) {
  exact(value, ['title', 'body', 'kind', 'status', 'robotName', 'tags', 'projectUrl']);
  const title = text(value.title, 160, 'Title', !reply), body = text(value.body, 8000, 'Message', true);
  const robotName = text(value.robotName, 60, 'Robot name');
  if (reply ? value.kind !== 'reply' || value.status !== '' || value.title !== '' : !Object.hasOwn(KINDS, value.kind) || !Object.hasOwn(STATUSES, value.status)) throw new Error('Choose a valid post type and status.');
  if (!Array.isArray(value.tags) || value.tags.length > 5 || value.tags.some(t => typeof t !== 'string' || !/^[a-z0-9][a-z0-9-]{0,23}$/.test(t)) || new Set(value.tags).size !== value.tags.length) throw new Error('Use up to five unique tags: lowercase letters, numbers or hyphens.');
  const projectUrl = text(value.projectUrl, 2000, 'Project link');
  if (projectUrl) {
    let url; try { url = new URL(projectUrl); } catch { throw new Error('Project links must be valid HTTPS URLs.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Project links must be valid HTTPS URLs.');
  }
  return { title, body, kind: value.kind, status: value.status, robotName, tags: value.tags, projectUrl };
}
export function validateCommand(value) {
  if (value?.action === 'create') {
    exact(value, ['action', 'id', 'parentId', 'content']);
    if (!isId(value.id) || value.parentId !== null && !isId(value.parentId)) throw new Error('Use a valid message ID.');
    return { ...value, content: validateContent(value.content, value.parentId !== null) };
  }
  if (value?.action === 'edit') {
    exact(value, ['action', 'id', 'expectedAt', 'content']);
    if (!isId(value.id) || validateRevision(value.expectedAt) === null) throw new Error('Reload the message before editing.');
    return { ...value, content: validateContent(value.content, value.content?.kind === 'reply') };
  }
  if (value?.action === 'remove') {
    exact(value, ['action', 'id', 'expectedAt']);
    if (!isId(value.id) || validateRevision(value.expectedAt) === null) throw new Error('Reload the message before removing it.');
    return value;
  }
  throw new Error('Unknown board action.');
}
export function validateQuery(search) {
  const allowed = ['owner', 'thread', 'cursor', 'kind', 'status', 'q'];
  if ([...search.keys()].some(key => !allowed.includes(key) || search.getAll(key).length !== 1)) throw new Error('Invalid board query.');
  const result = Object.fromEntries(['thread', 'cursor', 'kind', 'status', 'q'].map(key => [key, search.get(key) || '']));
  for (const key of ['thread', 'cursor']) if (result[key] && !isId(result[key])) throw new Error('Invalid message ID.');
  if (result.kind && !Object.hasOwn(KINDS, result.kind) || result.status && !Object.hasOwn(STATUSES, result.status)) throw new Error('Invalid filter.');
  if (result.q.length > 120 || result.q.includes('\u0000')) throw new Error('Search must be 120 characters or fewer.');
  result.q = result.q.trim(); return result;
}
export const emptyContent = () => ({ title: '', body: '', kind: 'update', status: 'working', robotName: '', tags: [], projectUrl: '' });
export const asContent = row => ({ title: row.title, body: row.body, kind: row.kind, status: row.status, robotName: row.robot_name, tags: row.tags, projectUrl: row.project_url });
