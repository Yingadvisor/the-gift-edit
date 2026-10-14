/** Local, pure adult gift context. No identity fields, I/O, or provider calls.
 * Product audience is merchandising evidence, not a claim about the recipient.
 * Age bands are soft context unless a stated product age range contradicts them.
 */
export const AUDIENCES = Object.freeze(['any', 'men', 'women', 'unisex']);
export const AGE_BANDS = Object.freeze(['any', '18-29', '30-44', '45-64', '65+']);
const bands = { '18-29': [18, 29], '30-44': [30, 44], '45-64': [45, 64], '65+': [65, Infinity] };
const queryPatterns = {
  men: /\b(?:men(?:['’]s)?|man|male)\b|男人|男性|男士/gi,
  women: /\b(?:women(?:['’]s)?|woman|female)\b|女人|女性|女士/gi,
  unisex: /\bunisex\b|男女通用|不限性别/gi,
};
function checkedQuery(query) {
  if (typeof query !== 'string' || query.length > 240) throw new TypeError('Query must be a string of at most 240 characters.');
  return query.trim();
}
function inferredAudience(query) {
  const matches = Object.entries(queryPatterns).filter(([, pattern]) => new RegExp(pattern.source, 'i').test(query)).map(([id]) => id);
  return matches.length === 1 ? matches[0] : 'any';
}
export function validateAudienceContext(context = {}, query = '') {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new TypeError('Audience context must be an object.');
  if (Object.keys(context).some(key => !['audience', 'ageBand'].includes(key))) throw new TypeError('Only audience and adult ageBand are supported; do not include identity or exact age.');
  const audience = context.audience ?? 'any';
  const ageBand = context.ageBand ?? 'any';
  if (!AUDIENCES.includes(audience)) throw new TypeError('Unsupported audience.');
  if (!AGE_BANDS.includes(ageBand)) throw new TypeError('Unsupported age band. Only the listed adult age bands are supported.');
  query = checkedQuery(query);
  const inferred = inferredAudience(query);
  const effectiveAudience = audience === 'any' ? inferred : audience;
  const conflict = audience !== 'any' && Object.entries(queryPatterns).some(([id, pattern]) => id !== audience && new RegExp(pattern.source, 'i').test(query));
  return {
    audience: effectiveAudience, ageBand,
    audienceSource: audience !== 'any' ? 'selected' : inferred !== 'any' ? 'query' : 'none',
    notice: conflict ? 'The selected audience takes priority over conflicting audience words in the search.' : null,
  };
}
export function audienceSearchQuery(query, context = {}) {
  const resolved = validateAudienceContext(context, query);
  let base = checkedQuery(query);
  if (resolved.notice) for (const pattern of Object.values(queryPatterns)) base = base.replace(pattern, ' ');
  base = base.replace(/\s+/g, ' ').trim();
  const label = { men: "men's", women: "women's", unisex: 'unisex' }[resolved.audience];
  const suffix = [label, resolved.ageBand !== 'any' ? 'adult' : ''].filter(Boolean).join(' ');
  if (!suffix) return base;
  // Keep the explicit context even when the original query fills the limit.
  const room = 240 - suffix.length - 1;
  return [base.slice(0, room).trimEnd(), suffix].filter(Boolean).join(' ');
}
function fields(value, source, depth = 0) {
  if (value == null || depth > 5) return [];
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).replace(/<[^>]*>/g, ' ').replace(/’/g, "'").replace(/\s+/g, ' ').trim();
    return text ? [{ source, text }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => fields(v, `${source}[${i}]`, depth + 1));
  if (typeof value !== 'object') return [];
  return Object.entries(value).filter(([key]) => !/^(?:id|url|image|media|html|handle|sku)$/i.test(key))
    .flatMap(([key, v]) => fields(v, `${source}.${key}`, depth + 1));
}
function sources(product, variant) {
  return [[product, 'product'], [variant, 'variant']].flatMap(([item, root]) => ['title', 'category', 'description', 'metadata']
    .flatMap(key => fields(item?.[key], `${root}.${key}`)));
}
function positive(text, pattern) {
  for (const match of text.matchAll(new RegExp(pattern.source, 'gi'))) {
    const before = text.slice(0, match.index).split(/[.!?;]/).at(-1);
    if (/\b(?:not|no|never|without)\b[^,;:]{0,40}$/i.test(before)) continue;
    return match[0];
  }
  return null;
}
const audiencePatterns = {
  men: /\b(?:men's|man's|for (?:a |adult )?(?:men|man|males?)|male (?:audience|adults?|users?))\b|男士|男性向|男款/,
  women: /\b(?:women's|woman's|for (?:a |adult )?(?:women|woman|females?)|female (?:audience|adults?|users?))\b|女士|女性向|女款/,
  unisex: /\b(?:unisex|all genders|any gender|gender[- ]neutral)\b|男女通用/,
};
export function classifyProductAudience(product, variant) {
  const evidence = [];
  const found = new Set();
  for (const entry of sources(product, variant)) {
    for (const [audience, pattern] of Object.entries(audiencePatterns)) {
      const structured = /\.(?:gender|audience|target[_ -]?gender|category(?:\.name)?)$/i.test(entry.source)
        && ({ men: /^(?:male|man|men|men's)$/i, women: /^(?:female|woman|women|women's)$/i, unisex: /^(?:unisex|all|any|gender[- ]neutral)$/i }[audience]).test(entry.text);
      if (structured || positive(entry.text, pattern)) {
        found.add(audience);
        evidence.push({ audience, source: entry.source, text: entry.text });
      }
    }
  }
  // Separate men's and women's evidence can describe selectable variants. Do not
  // silently turn contradictory listings into a verified unisex product.
  const audience = found.size === 0 ? 'unknown' : found.size === 1 ? [...found][0]
    : found.has('unisex') ? 'unisex' : 'mixed';
  return { audience, evidence };
}
function ageEvidence(product, variant) {
  const ranges = [];
  const childEvidence = [];
  for (const entry of sources(product, variant)) {
    const structuredChild = /\.(?:age[_ -]?group|audience|ageRange)$/i.test(entry.source) && /^(?:children|child|kids|toddler|infant|baby)$/i.test(entry.text);
    const titleChild = /\.(?:title|category)(?:\.|$)/.test(entry.source) && /^(?:kids'?|children's|child's|toddler's|boys'?|girls'?)\s/i.test(entry.text);
    // Inclusive product-use statements are not child-only targeting. Keep this
    // local to the listing field; adult purchasers/supervision are not evidence
    // that the product itself is intended for adults. Explicit child categories,
    // child-only wording, and actual child-only ranges still take priority.
    const inclusive = positive(entry.text, /\b(?:for (?:both )?(?:kids|children) (?:and|&) adults|for (?:both )?adults (?:and|&) (?:kids|children)|(?:suitable for|designed for|intended for|for) all ages|all[- ]ages (?:toy|game|puzzle|collectible))\b/);
    const childOnly = positive(entry.text, /\b(?:(?:only|exclusively) for (?:kids|children|toddlers|infants|babies)|for (?:kids|children|toddlers|infants|babies) only|(?:kids|children)[- ]only)\b/);
    const childTarget = positive(entry.text, /\b(?:designed for|intended for|suitable for|for) (?:kids|children|toddlers|infants|babies)\b/);
    if (structuredChild || titleChild || childOnly || (childTarget && !inclusive)) childEvidence.push(entry);
    for (const match of entry.text.matchAll(/\b(?:ages?|aged|age range)\s*[:=]?\s*(\d{1,3})\s*(?:[-–—]|to)\s*(\d{1,3})(?:\s*(?:years?|yrs?)(?: old)?)?\b/gi)) {
      if (positive(entry.text, new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))) {
        const min = Number(match[1]), max = Number(match[2]);
        if (min <= max && max <= 130) ranges.push({ min, max, ...entry });
      }
    }
    const plainRange = /\.(?:age[_ -]?range)$/i.test(entry.source) && /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(entry.text);
    if (plainRange && Number(plainRange[1]) <= Number(plainRange[2]) && Number(plainRange[2]) <= 130) ranges.push({ min: Number(plainRange[1]), max: Number(plainRange[2]), ...entry });
    for (const match of entry.text.matchAll(/\b(?:ages?|aged)\s*[:=]?\s*(\d{1,3})\s*\+/gi)) {
      if (Number(match[1]) <= 130) ranges.push({ min: Number(match[1]), max: Infinity, ...entry });
    }
  }
  return { ranges, childEvidence };
}
export function assessAudience(product, variant, context = {}, query = '') {
  const resolved = validateAudienceContext(context, query);
  const classified = classifyProductAudience(product, variant);
  const age = ageEvidence(product, variant);
  const reasons = [];
  let eligible = true;
  let audienceStatus = 'not-requested';
  if (resolved.audience !== 'any') {
    if (classified.audience === 'unknown' || classified.audience === 'mixed') {
      audienceStatus = 'unknown';
      reasons.push("Can't verify audience from the product listing.");
    } else if (classified.audience === resolved.audience || (resolved.audience !== 'unisex' && classified.audience === 'unisex')) {
      audienceStatus = 'listing-evidence';
      reasons.push(`Listing explicitly identifies the product as ${classified.audience}; this is not a personal style guarantee.`);
    } else {
      eligible = false;
      audienceStatus = 'incompatible';
      reasons.push(`Listing explicitly identifies ${classified.audience}, not the selected ${resolved.audience} audience.`);
    }
  }
  let ageStatus = 'not-requested';
  const childOnlyRange = age.ranges.length > 0 && age.ranges.every(range => range.max < 18);
  if (age.childEvidence.length || childOnlyRange) {
    eligible = false;
    ageStatus = 'incompatible';
    reasons.push('Listing explicitly targets children; this release supports adult gift context only.');
  } else if (resolved.ageBand !== 'any') {
    const [min, max] = bands[resolved.ageBand];
    if (age.ranges.length && age.ranges.every(range => range.max < min || range.min > max)) {
      eligible = false;
      ageStatus = 'incompatible';
      reasons.push('The stated product age range does not overlap the selected adult age band.');
    } else {
      ageStatus = age.ranges.length ? 'range-overlap' : 'unknown';
      reasons.push(age.ranges.length ? 'The stated age range overlaps the selected band; individual suitability is not verified.' : "Can't verify age suitability. The selected adult age band is soft search context only.");
    }
  }
  return {
    eligible, status: !eligible ? 'incompatible' : audienceStatus === 'unknown' || ageStatus === 'unknown' ? 'unknown' : 'compatible',
    audienceStatus, ageStatus, audience: classified.audience, context: resolved,
    reason: reasons.join(' ') || 'No audience or age preference selected.',
    evidence: [...classified.evidence, ...age.childEvidence, ...age.ranges],
  };
}
