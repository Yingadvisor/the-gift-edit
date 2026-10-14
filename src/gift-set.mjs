/** Gift-set amounts are integer USD cents, never a delivered quote.
 * These checks validate the supplied snapshot, not current merchant stock.
 * Checkout must refresh every exact variant and recheck its reviewed details.
 */
const MAX_ITEMS = 6;
const text = value => typeof value === 'string' && value.trim().length > 0;
const priceOkay = variant => variant?.price?.currency === 'USD' && Number.isSafeInteger(variant.price.amount) && variant.price.amount >= 0;
function budgetCents(budget) {
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0 || budget > 10000) return null;
  const cents = Math.round(budget * 100);
  return Math.abs(budget * 100 - cents) < 1e-7 && cents > 0 ? cents : null;
}
export function setItemKey(entry) {
  return text(entry?.variant?.id) ? entry.variant.id : null;
}
function validOptions(options) {
  return Array.isArray(options) && options.every(o => o && text(o.name) && text(o.label)) && new Set(options.map(o => o.name)).size === options.length;
}
function sameOptions(a, b) {
  return validOptions(a) && validOptions(b) && a.length === b.length && a.every(x => b.some(y => x.name === y.name && x.label === y.label));
}
function exactSelected(entry) {
  const requested = entry?.selected;
  if (!validOptions(requested)) return false;
  if (requested.length) return sameOptions(requested, entry?.product?.selected) && sameOptions(requested, entry?.variant?.options);
  // An omitted array is only an optionless default, never evidence that a
  // named selection was honored. Malformed/null option tables fail closed.
  const absentOrEmpty = value => value === undefined || (Array.isArray(value) && value.length === 0);
  const product = entry?.product;
  return absentOrEmpty(product?.options) && absentOrEmpty(product?.selected) && absentOrEmpty(entry?.variant?.options)
    && (product?.variants === undefined || (Array.isArray(product.variants) && product.variants.every(v => v && absentOrEmpty(v.options))));
}
function entryProblems(entry) {
  const problems = [];
  if (!text(entry?.product?.id)) problems.push('Missing product identifier.');
  if (!setItemKey(entry)) problems.push('Missing variant identifier.');
  if (!text(entry?.variant?.seller?.domain)) problems.push('Missing merchant.');
  if (!priceOkay(entry?.variant)) problems.push('An exact non-negative USD price in integer cents is required.');
  if (entry?.variant?.availability?.available !== true) problems.push('Variant availability is not confirmed.');
  if (entry?.quantity !== undefined && entry.quantity !== 1) problems.push('Each variant must have quantity one.');
  return problems;
}
/** Invalid or overflowing prices produce null totals rather than a misleading partial sum. */
export function summarizeGiftSet(items, budgetUsd) {
  const problems = [];
  const budget = budgetCents(budgetUsd);
  if (budget === null) problems.push('Use a USD budget greater than zero and no more than 10,000, with at most two decimal places.');
  const entries = Array.isArray(items) ? items : [];
  if (!Array.isArray(items)) problems.push('Gift set must be an array.');
  if (!entries.length) problems.push('Choose at least one gift.');
  if (entries.length > MAX_ITEMS) problems.push('A gift set can contain at most six variants.');
  const seen = new Set();
  const groupsByShop = new Map();
  let subtotal = 0;
  entries.forEach((entry, index) => {
    const label = `Gift ${index + 1}: `;
    entryProblems(entry).forEach(p => problems.push(label + p));
    const key = setItemKey(entry);
    if (key && seen.has(key)) problems.push(label + 'Duplicate variant; quantities are limited to one.');
    if (key) seen.add(key);
    if (entry?.reviewed !== true) problems.push(label + 'Review the exact variant details before checkout.');
    if (typeof entry?.detailsHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(entry.detailsHash)) problems.push(label + 'Reviewed details hash is missing or invalid.');
    if (!exactSelected(entry)) problems.push(label + 'Requested options do not exactly match the returned product and variant.');
    const amount = priceOkay(entry?.variant) ? entry.variant.price.amount : null;
    subtotal = subtotal !== null && amount !== null && Number.isSafeInteger(subtotal + amount) ? subtotal + amount : null;
    const shop = entry?.variant?.seller?.domain;
    if (text(shop)) {
      if (!groupsByShop.has(shop)) groupsByShop.set(shop, {shop, merchantName: text(entry.variant.seller.name) ? entry.variant.seller.name : shop, items: [], subtotal: 0});
      const group = groupsByShop.get(shop);
      group.items.push(entry);
      group.subtotal = group.subtotal !== null && amount !== null && Number.isSafeInteger(group.subtotal + amount) ? group.subtotal + amount : null;
    }
  });
  if (subtotal === null) problems.push('A trustworthy USD subtotal cannot be calculated.');
  const remaining = budget !== null && subtotal !== null ? budget - subtotal : null;
  const overBudget = remaining !== null && remaining < 0;
  if (overBudget) problems.push('The gift set exceeds the item-price budget.');
  return {subtotal, remaining, overBudget, valid: problems.length === 0, problems, groups: [...groupsByShop.values()]};
}
/** Adding does not mark an item reviewed: selection/detail review may follow. */
export function canAddToGiftSet(items, candidate, budgetUsd) {
  const reject = reason => ({allowed: false, reason});
  const budget = budgetCents(budgetUsd);
  if (budget === null) return reject('Enter a valid USD budget greater than zero and no more than 10,000.');
  if (!Array.isArray(items)) return reject('Gift set must be an array.');
  const issue = entryProblems(candidate)[0];
  if (issue) return reject(issue);
  if (items.some(item => setItemKey(item) === setItemKey(candidate))) return reject('This exact variant is already in the gift set.');
  if (items.length >= MAX_ITEMS) return reject('A gift set can contain at most six variants.');
  let subtotal = candidate.variant.price.amount;
  const seen = new Set();
  for (const item of items) {
    const issue = entryProblems(item)[0];
    if (issue) return reject('Fix the existing gift set first: ' + issue);
    const key = setItemKey(item);
    if (seen.has(key)) return reject('Remove duplicate variants from the existing gift set first.');
    seen.add(key);
    subtotal += item.variant.price.amount;
    if (!Number.isSafeInteger(subtotal)) return reject('A trustworthy USD subtotal cannot be calculated.');
  }
  // A candidate set may exceed the target while the shopper compares items.
  // summarizeGiftSet still blocks checkout until the total fits the explicit budget.
  return {allowed: true, reason: null};
}
