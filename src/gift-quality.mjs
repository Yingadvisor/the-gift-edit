// Catalog-grounded roles, not price-based judgments. Birthday alone never asks for a card.
const plain = value => typeof value === 'string' ? value : value?.plain ?? '';
const clean = value => plain(value).toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
const classes = [
  {name: 'greeting card', pattern: /\b(?:(?:greeting|birthday|anniversary|congratulations|thank you|holiday|christmas|valentine|mother'?s day|father'?s day) cards?|cards? (?:for|to) (?:a |your |the )?(?:birthday|mum|mom|dad|friend))\b|贺卡|賀卡/},
  {name: 'gift wrapping', pattern: /\b(?:gift wrap(?:ping)?|wrapping paper|gift bags?|gift tissue|gift bows?|gift tags?)\b|礼品包装|包裝紙/},
  {name: 'empty gift box', pattern: /\b(?:(?:empty|unfilled|packaging) gift box(?:es)?|gift box(?:es)? (?:only|packaging|empty)|empty box(?:es)?)\b|空礼盒|空禮盒/},
  {name: 'party accessory', pattern: /\b(?:party (?:decorations?|supplies|favors?|favours?|hats?|banners?)|birthday banners?|birthday candles?|balloons?|cake toppers?|confetti)\b|派对装饰|氣球|气球/},
];
export function assessGiftRole(product = {}, variant = {}, profile = {}) {
  const coreTitle = value => clean(value).split(/\b(?:with|includes?|including|plus)\b|\s[+&]\s/)[0];
  const title = coreTitle(product.title) + ' ' + coreTitle(variant.title);
  const category = clean(product.category?.name ?? product.category);
  const description = clean(product.description) + ' ' + clean(variant.description);
  // Incidental "includes a greeting card" or "gift wrapping available" does not
  // turn a real gift into packaging. Use description only for otherwise generic titles.
  const generic = /^(?:gift|present|surprise|birthday|default title|\s)+$/.test(title);
  let kind = classes.find(c => c.pattern.test(title) || c.pattern.test(category) || (generic && c.pattern.test(description)));
  if (!kind && /\bcards?\b/.test(title) && !/\b(?:card game|playing cards|tarot|oracle|trading cards)\b/.test(category + ' ' + description) && !/\b(?:card games?|playing cards?|tarot|oracle|flash cards?|memory cards?|card holders?|cardholders?|wallet|business cards?|trading cards?|gift cards?)\b/.test(title)) kind = classes[0];
  if (!kind && /\bgift box(?:es)?\b/.test(title) && /\b(?:empty|unfilled|packaging only|contents not included|box only)\b/.test(description)) kind = classes[2];
  if (!kind) return {role: 'primary', reason: 'Catalog identifies a standalone gift rather than an add-on.'};
  const request = clean(profile.query) + ' ' + clean(profile.likes);
  if (kind.pattern.test(request) || (kind === classes[0] && /\b(?:collects?|collecting|wants?|likes?|loves?)\s+(?:handmade\s+)?(?:greeting\s+)?cards?\b/.test(request))) {
    return {role: 'primary', reason: `Recipient interests or the search explicitly request ${kind.name}.`};
  }
  return {role: 'addon', reason: `Catalog identifies ${kind.name}; offer it as an optional add-on, not a main gift.`};
}
// priceAmount uses the catalog's integer minor units (USD cents). A soft ranking
// hint only: inexpensive, relevant gifts remain eligible and full spend is not a goal.
export function primaryGiftValueScore(priceAmount, budgetUsd) {
  if (!Number.isFinite(priceAmount) || priceAmount < 0 || !Number.isFinite(budgetUsd) || budgetUsd <= 0) return 0;
  const ratio = priceAmount / (budgetUsd * 100);
  if (ratio > 1) return 0;
  if (ratio < 0.2) return 0.6 + 2 * ratio;
  if (ratio <= 0.8) return 1;
  return 1 - (ratio - 0.8);
}
