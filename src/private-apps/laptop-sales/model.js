export const SLUG = 'laptop-sales';
export const KEY = 'inventory';
export const MAX_LISTINGS = 50;

export const stages = {
  draft: 'Preparing',
  ready: 'Ready to sell',
  paid: 'Paid',
  shipped: 'Shipped',
};

export const software = [
  ['LibreOffice', 'Documents, spreadsheets, and presentations'],
  ['GIMP', 'Photo editing'],
  ['Inkscape', 'Vector graphics'],
  ['Scribus', 'Page layout'],
  ['Kdenlive', 'Video editing'],
  ['Audacity', 'Audio editing'],
  ['Okular', 'PDF viewing and annotations'],
];

export const checks = {
  wiped: 'Previous owner’s data erased',
  hardware: 'Battery, Wi-Fi, webcam, audio, and sleep tested',
  omarchy: 'Omarchy prepared for the buyer’s first boot',
  software: 'Included software installed and tested',
  checkout: 'Stripe link configured for one sale and collects shipping details',
};

export const blankListing = {
  model: '', specs: '', condition: '', price: '', checkout: '', stage: 'draft',
  checks: Object.fromEntries(Object.keys(checks).map(key => [key, false])),
};

export const checkoutLink = 'https://dashboard.stripe.com/payment-links';
export const omarchyGuide = 'https://omarchy.org/manual/getting-started/';

export function stripeUrl(value) {
  return /^https:\/\/buy\.stripe\.com\/(?!test_)[A-Za-z0-9_-]{8,100}$/.test(value);
}

function exactKeys(value, shape) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === Object.keys(shape).length
    && Object.keys(shape).every(key => Object.hasOwn(value, key));
}

export function validateInventory(listings) {
  if (!Array.isArray(listings) || listings.length > MAX_LISTINGS) throw Error('Invalid inventory.');
  const ids = new Set();
  const links = new Set();
  return listings.map(listing => {
    if (!exactKeys(listing, { ...blankListing, id: '' })
      || typeof listing.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(listing.id)
      || ids.has(listing.id)) throw Error('Invalid or duplicate listing.');
    ids.add(listing.id);
    const { id, stage, checks: preparation } = listing;
    if (typeof stage !== 'string' || !Object.hasOwn(stages, stage) || !exactKeys(preparation, checks)
      || Object.values(preparation).some(value => typeof value !== 'boolean')) throw Error('Invalid listing stage or checklist.');
    const fields = {};
    for (const [field, limit] of Object.entries({ model: 100, specs: 240, condition: 500, price: 9, checkout: 150 })) {
      if (typeof listing[field] !== 'string' || listing[field].length > limit) throw Error('A listing field is too long or invalid.');
      fields[field] = listing[field].trim();
    }
    if (!fields.model) throw Error('Enter the laptop model.');
    if (fields.price && !/^(?:[1-9]\d{0,4}(?:\.\d{1,2})?|0\.(?:0[1-9]|[1-9]\d?))$/.test(fields.price)) {
      throw Error('Enter a positive USD price with up to two decimal places.');
    }
    if (fields.checkout && (!stripeUrl(fields.checkout) || links.has(fields.checkout))) {
      throw Error('Use a unique live buy.stripe.com payment link for this laptop.');
    }
    if (fields.checkout) links.add(fields.checkout);
    if (stage !== 'draft' && (!Object.values(fields).every(Boolean) || !Object.values(preparation).every(Boolean))) {
      throw Error('Fill in the listing and complete every check before changing its stage.');
    }
    return { id, ...fields, stage, checks: preparation };
  });
}

export const priceLabel = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

export function listingText(item, supportEmail) {
  return [
    `${item.model} — ${priceLabel(item.price)} USD`,
    item.specs,
    `Condition: ${item.condition}`,
    'Ships with Omarchy Linux and first-boot setup for the buyer.',
    `Included: ${software.map(([name]) => name).join(', ')}.`,
    'Check compatibility with the file formats and workflows you depend on.',
    `Buy this laptop: ${item.checkout}`,
    `Email support: ${supportEmail} (subject: Setup, Office, or Creative for a quick guide)`,
  ].join('\n\n');
}
