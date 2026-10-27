import { SLUG, KEY, MAX_BYTES, validateScreen } from '../private-apps/morning-feed/model.js';

// Only reviewed whole-document contracts may use the trusted chat operator tool.
const contracts = new Map([[SLUG, { key: KEY, maxBytes: MAX_BYTES, validate: validateScreen }]]);
export function appDataContract(slug) {
  const contract = contracts.get(slug);
  if (!contract) throw new Error('App has no reviewed chat data contract');
  return contract;
}
