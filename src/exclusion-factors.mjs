/** Conservative, evidence-only screening. No match is not a safety guarantee.
 * Only explicit contrary evidence resolves a factor; otherwise it remains unknown.
 * Bulk thresholds are >= 100 cm on one stated dimension or >= 10 kg stated weight.
 */
export const EXCLUSION_FACTORS = Object.freeze([
  ['clothes-shoes', 'Clothes & shoes'], ['food-alcohol', 'Food & alcohol'],
  ['fragrance', 'Fragranced items'], ['sizing', 'Requires a size choice'],
  ['bulky', 'Large or heavy items'], ['high-maintenance', 'High-maintenance gifts'],
].map(([id, label]) => Object.freeze({ id, label })));

function fields(value, path, depth = 0) {
  if (depth > 5 || value == null) return [];
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).replace(/<[^>]*>/g, ' ').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
    return text ? [{ source: path, text }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => fields(v, `${path}[${i}]`, depth + 1));
  if (typeof value !== 'object') return [];
  return Object.entries(value).filter(([k]) => !/^(id|url|image|media|html|handle|sku)$/i.test(k))
    .flatMap(([k, v]) => fields(v, `${path}.${k}`, depth + 1));
}
function sources(product, variant) {
  return [
    ...fields(product?.title, 'product.title'), ...fields(product?.category, 'product.category'),
    ...fields(product?.description, 'product.description'), ...fields(product?.metadata, 'product.metadata'),
    ...fields(variant?.title, 'variant.title'), ...fields(variant?.description, 'variant.description'),
    ...fields(variant?.metadata, 'variant.metadata'),
    ...[product, variant].flatMap((item, i) => (Array.isArray(item?.options) ? item.options : []).flatMap((option, j) => {
      const value = option?.label ?? option?.value;
      return typeof option?.name === 'string' && typeof value === 'string'
        ? [{source: `${i ? 'variant' : 'product'}.options[${j}]`, text: `${option.name}: ${value}`}] : [];
    })),
  ];
}
// Keep negation local to the clause containing the evidence, not an unrelated sentence.
function affirmative(text, pattern) {
  for (const clause of text.split(/(?<!\d)\.|\.(?!\d)|[;!?]|\bbut\b|\bhowever\b/i)) {
    const re = new RegExp(pattern.source, 'gi');
    for (const match of clause.matchAll(re)) {
      const before = clause.slice(Math.max(0, match.index - 65), match.index);
      const after = clause.slice(match.index + match[0].length, match.index + match[0].length + 20);
      if (/\b(?:no|not|never|without|free of|doesn't|don't|isn't|aren't)\b[^,;:]{0,45}$/i.test(before)) continue;
      if (/^[- ]free\b/i.test(after)) continue;
      return match[0];
    }
  }
  return null;
}
const APPAREL = /\b(?:apparel|clothing|footwear|shirts?|t-shirts?|sweaters?|hoodies?|jackets?|coats?|trousers|jeans|leggings|dresses|skirts?|socks?|shoes?|boots?|sneakers?|sandals?|slippers|pajamas|pyjamas|gloves?)\b/i;
function apparelText(text) {
  return text.replace(/\b(?:shoe|boot|coat|dress|shirt|sweater)\s+(?:racks?|brush(?:es)?|polish|bags?|boxes|box|hangers?|patterns?|charms?|shaped|print(?:s)?)\b/gi, 'accessory');
}
function foodText(text) {
  return text.replace(/\b(?:wine|beer|cocktail|whiskey|whisky|champagne|coffee|tea|chocolate|cookie|cake|food|sea salt|honey|sauce)\s*[- ]\s*(?:candles?|soaps?|lotions?|balms?|scrubs?|bath salts?|accessories|glasses|glass|cups?|mugs?|goblets?|tumblers?|openers?|racks?|stoppers?|decanters?|coolers?|holders?|scented|scent|fragrance|flavou?red|shaped|patterns?|prints?|towels?|plates?|dishes|dish|jars?|tins?|makers?|machines?|infusers?|pots?|sets? of glasses)\b/gi, 'accessory');
}
const FOOD = /\b(?:edible|food|alcoholic beverage|confectionery|chocolates?|candies|candy|cookies|biscuits|snacks?|wine|beer|whiskey|whisky|champagne|coffee beans|loose[- ]leaf tea|dried tea|tea leaves|tea bags|sea salt|honey|sauces?|condiments)\b/i;
const FRAGRANCE = /\b(?:scented|fragranced|perfumed|perfume|cologne|eau de parfum|eau de toilette|essential oils?|aromatherapy|scent(?: notes)?\s*:\s*(?!none\b|free\b|unscented\b)[a-z]+|fragrance\s*:\s*(?!none\b|free\b|unscented\b)[a-z]+)\b/i;
const FURNITURE = /\b(?:furniture|sofa|couch|armchair|wardrobe|bookcase|dining table|dresser|bed frame)\b/i;
const CARE = /\b(?:requires? (?:daily|frequent|regular) (?:watering|pruning|misting|feeding|maintenance|care)|needs? (?:daily|frequent) (?:watering|misting|care)|hand[- ]wash only|dry[- ]clean only|high[- ]maintenance|demanding upkeep|water daily|mist daily)\b/i;
const NEGATIVES = {
  'clothes-shoes': /\b(?:not (?:clothing|apparel|footwear)|no (?:clothes|shoes) included)\b/i,
  'food-alcohol': /\b(?:contains no food or alcohol|not food or alcohol)\b/i,
  fragrance: /\b(?:unscented|unfragranced|(?:scent|fragrance|perfume)[- ]free|no (?:added )?(?:scent|fragrance|perfume)|without (?:scent|fragrance|perfume))\b/i,
  sizing: /\b(?:one[- ]size(?: fits all)?|no size (?:choice|selection) (?:needed|required)|adjustable universal fit)\b/i,
  bulky: /\b(?:compact and lightweight|lightweight and compact|not bulky)\b/i,
  'high-maintenance': /\b(?:maintenance[- ]free|low[- ]maintenance|no (?:care|maintenance|watering) (?:needed|required))\b/i,
};
function bulkyEvidence(entry) {
  const text = entry.text;
  if (affirmative(text, FURNITURE) && affirmative(text, /\b(?:large|bulky|heavy|oversized)\b/i)) return '';
  // Units are mandatory. A number without an explicit size/weight role is not evidence.
  const dimensionContext = /\b(?:dimensions?|width|height|length|depth|measures?)\b/i.test(`${entry.source} ${text}`) || /\d\s*(?:x|×)\s*\d/i.test(text);
  const weightContext = /\b(?:weight|weighs?|mass)\b/i.test(`${entry.source} ${text}`);
  const expandedDimensions = text.replace(/\b(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)(?:\s*(?:x|×)\s*(\d+(?:\.\d+)?))?\s*(cm|mm|m|inches|inch|in|feet|ft)\b/gi, (_, a, b, c, unit) => [a, b, c].filter(Boolean).map(n => `${n} ${unit}`).join(' x '));
  for (const m of expandedDimensions.matchAll(/\b(\d+(?:\.\d+)?)\s*(centimeters?|cm|millimeters?|mm|m|meters?|metres?|inches|inch|in|feet|ft|kilograms?|kg|pounds?|lbs?)\b/gi)) {
    if (!affirmative(expandedDimensions, new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))) continue;
    const unit = m[2].toLowerCase();
    const mass = /^(?:kg|kilogram|pound|lb)/.test(unit);
    const multiplier = mass ? (/^(?:pound|lb)/.test(unit) ? 0.45359237 : 1)
      : /^(?:mm|millimeter)/.test(unit) ? 0.1 : /^(?:cm|centimeter)/.test(unit) ? 1
      : /^(?:in|inch)/.test(unit) ? 2.54 : /^(?:ft|feet)/.test(unit) ? 30.48 : 100;
    if ((mass ? weightContext : dimensionContext) && Number(m[1]) * multiplier >= (mass ? 10 : 100))
      return ` (${mass ? 'weight ≥10 kg' : 'dimension ≥100 cm'} screening threshold)`;
  }
  return null;
}

export function assessExclusions(product, variant, selectedIds = []) {
  const entries = sources(product, variant);
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const identity = entries.filter(e => /\.(?:title|category)(?:\.|$)/.test(e.source));
  const apparel = identity.find(e => affirmative(apparelText(e.text), APPAREL))
    || entries.find(e => affirmative(apparelText(e.text), /\b(?:this|a|an) (?:wearable |cotton |wool |leather )?(?:shirt|sweater|hoodie|jacket|dress|pair of shoes|pair of socks)\b/i));
  const bodyFit = apparel || identity.find(e => affirmative(e.text, /\b(?:rings?|helmets?|hats?|belts?|bras?)\b/i));
  const options = [...(Array.isArray(product?.options) ? product.options : []), ...(Array.isArray(variant?.options) ? variant.options : [])];
  const matches = [], unknown = [];
  for (const factor of EXCLUSION_FACTORS.filter(f => selected.has(f.id))) {
    let found = null, suffix = '';
    if (factor.id === 'clothes-shoes') found = apparel;
    if (factor.id === 'food-alcohol') found = identity.find(e => affirmative(foodText(e.text), FOOD))
      || entries.find(e => affirmative(foodText(e.text), /\b(?:edible|contains (?:chocolates|cookies|snacks)|alcohol content|\d+(?:\.\d+)?%\s*abv)\b/i));
    if (factor.id === 'fragrance') found = entries.find(e => affirmative(e.text.replace(/\b(?:essential oils?|perfume|cologne)\s+(?:storage )?(?:boxes|box|holders?|stands?|bottles?)(?:\s+only)?\b/gi, 'accessory'), FRAGRANCE));
    if (factor.id === 'sizing' && bodyFit) {
      // Concrete body-size options outrank incidental prose, e.g. a hoodie that
      // includes a one-size scarf. A generic option name alone is insufficient.
      const option = options.find(o => {
        if (!/\b(?:size|waist|inseam|shoe size|ring size)\b/i.test(String(o?.name ?? ''))) return false;
        const values = [o?.label, o?.value, ...(Array.isArray(o?.values) ? o.values.map(v => typeof v === 'object' ? v?.label ?? v?.value : v) : [])];
        return values.some(v => typeof v === 'string' && v.trim() && !NEGATIVES.sizing.test(v));
      });
      if (option) found = { source: 'options', text: `${bodyFit.text}; ${JSON.stringify(option)}` };
      else if (!entries.some(e => NEGATIVES.sizing.test(e.text)))
        found = entries.find(e => affirmative(e.text, /\b(?:choose|select) (?:your |a )?size|\b(?:waist|inseam|shoe size|ring size)\s*[:=]?\s*\d/i));
    }
    if (factor.id === 'bulky') for (const entry of entries) {
      const result = bulkyEvidence(entry);
      if (result !== null) { found = entry; suffix = result; break; }
    }
    if (factor.id === 'high-maintenance') found = entries.find(e => affirmative(e.text, CARE));
    if (found) matches.push({ ...factor, evidence: `${found.source}: “${found.text}”${suffix}` });
    else if (!entries.some(e => NEGATIVES[factor.id].test(e.text))) unknown.push({ ...factor });
  }
  return { matches, unknown };
}
