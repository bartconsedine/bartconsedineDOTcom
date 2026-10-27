import { SLUG, KEY, MAX_BYTES, validatePlan } from '../private-apps/japan-trip/model.js';

// Shared by trusted chat tooling and app APIs. Only reviewed data contracts belong here.
const contracts = new Map([[SLUG, { key: KEY, maxBytes: MAX_BYTES, validate: validatePlan }]]);
export function appDataContract(slug) {
  const contract = contracts.get(slug);
  if (!contract) throw new Error('App has no reviewed chat data contract');
  return contract;
}
export { validateRevision } from './record-revision.js';
