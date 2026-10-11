import { SLUG, KEY, MAX_BYTES, validatePlan } from '../private-apps/japan-trip/model.js';

// Shared by trusted chat tooling and app APIs. Only reviewed data contracts belong here.
const contracts = new Map([[SLUG, { key: KEY, maxBytes: MAX_BYTES, validate: validatePlan }]]);
export function appDataContract(slug) {
  const contract = contracts.get(slug);
  if (!contract) throw new Error('App has no reviewed chat data contract');
  return contract;
}
export function validateRevision(value) {
  if (value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) throw new Error('Expected a database timestamp or null');
  return value;
}
