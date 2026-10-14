import { CATALOG, CATALOG_INFO } from './catalog.mjs';
export const ENGINE = Object.freeze({ id: 'rules-v1', label: 'Rules-based demo', modelConnected: false, disclosure: 'No AI model is connected. Matches use explicit keyword rules and your stated recipient preferences.' });
const GROUPS = {
  celestial: ['space','astronomy','astronomer','stars','star','stargazing','galaxy','galaxies','planet','planets','celestial','cosmos'],
  ocean: ['ocean','sea','seaside','beach','beaches','coast','coastal','shell','shells','nautical','surf','surfing','waves'],
  botanical: ['botanical','botanicals','plant','plants','garden','gardening','gardener','flowers','flower','floral','forest','woodland','ferns'],
  geometric: ['geometric','geometry','architecture','mountain','mountains','travel','traveling','travelling','landscape','retro'],
  pillow: ['pillow','pillows','cushion','cushions'],
  tote: ['tote','totes','bag','bags','canvas'],
  towels: ['towel','towels','linen','kitchen','cooking','baking'],
  'pocket-square': ['pocket square','pocket squares','silk','formalwear','suit','suits','accessories','fashion'],
  napkins: ['napkin','napkins','cocktail','cocktails','tableware'],
  hosting: ['hosting','host','entertaining','dinner parties','dinner party','tableware','cocktails'],
  home: ['home','decor','decoration','interiors','cozy','cosy'],
  everyday: ['practical','useful','everyday','commute','commuting'],
  style: ['fashion','style','dressing','formalwear','suits'],
  travel: ['travel','traveling','travelling','adventure','adventures']
};
const normal = value => String(value ?? '').toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const contains = (text, term) => (` ${normal(text)} `).includes(` ${normal(term)} `);
const match = (text, terms) => terms.filter(term => contains(text, term));
const labels = {celestial:'celestial imagery',ocean:'ocean imagery',botanical:'botanical imagery',geometric:'geometric landscapes',hosting:'hosting',home:'home decor',everyday:'everyday usefulness',style:'personal style',travel:'travel'};

export function validateProfile(input) {
  const errors = [];
  const recipient = String(input?.recipient ?? '').trim();
  const likes = String(input?.likes ?? '').trim();
  const budget = Number(input?.budget);
  if (!recipient || recipient.length > 80) errors.push('Add a recipient name or description, up to 80 characters.');
  if (!likes || likes.length > 1200) errors.push('Tell us what the recipient likes, up to 1,200 characters.');
  if (!Number.isFinite(budget) || budget <= 0 || budget > 10000) errors.push('Enter a demo budget greater than 0 and no more than 10,000.');
  if (String(input?.dislikes ?? '').length > 1200) errors.push('Keep dislikes under 1,200 characters.');
  if (String(input?.occasion ?? '').length > 80) errors.push('Keep the occasion under 80 characters.');
  return { valid: !errors.length, errors, profile: {recipient, likes, budget, dislikes: String(input?.dislikes ?? '').trim(), occasion: String(input?.occasion ?? 'Just because').trim(), relationship: String(input?.relationship ?? '').slice(0,80)} };
}

/** Rules deliberately prefer uncertainty over invented recipient interests. */
export function extractEvidence(profile) {
  const positive = [], negatives = [profile.dislikes];
  const notices = [];
  for (const fragment of profile.likes.replace(/[’]/g, "'").split(/[.!?;\n]+|\b(?:but|whereas|while)\b|\band(?=\s+(?:they|he|she|I|we|the recipient)\b)/i).filter(Boolean)) {
    // Giver interests must never silently become recipient preferences.
    if (/\b(i|me|we|our|my)\b/i.test(fragment)) {
      notices.push('A first-person statement was not treated as the recipient’s preference. Rewrite it as “They like …” if that is what you mean.');
      continue;
    }
    const negative = /\b(dislikes?|hates?|avoid|avoids|neither|nor|except|excluding|without|allerg(?:y|ic)|no|not|never|doesn't|don't|isn't|aren't|wasn't|weren't|can't|cannot|won't|wouldn't|didn't|does not|do not)\b/i.exec(fragment);
    if (negative) {
      positive.push(fragment.slice(0, negative.index));
      negatives.push(fragment.slice(negative.index));
      notices.push('A negative statement in the likes field was treated conservatively as an exclusion. Use the dislikes field to make it explicit.');
    } else positive.push(fragment);
  }
  const text = positive.join(' ');
  return { positiveText: text, negativeText: negatives.join(' '), signals: Object.fromEntries(Object.entries(GROUPS).map(([group, terms]) => [group, match(text, terms)])), notices: [...new Set(notices)] };
}
function excludedBy(product, evidence, excludedIds, excludedCategories) {
  if (excludedIds.includes(product.id)) return 'You excluded this item.';
  if (excludedCategories.includes(product.category)) return 'You excluded this category.';
  const motifAliases = {flowers:['flower','flowers','floral','florals'],plants:['plant','plants','foliage','leaves'],shell:['shell','shells','nautilus'],wave:['wave','waves'],stars:['star','stars'],moon:['moon','moons'],mountains:['mountain','mountains'],arches:['arch','arches'],galaxy:['galaxy','galaxies']};
  const terms = [product.theme, product.category, ...product.materials, ...product.colors, ...product.motifs.flatMap(m=>motifAliases[m] ?? [m]), ...(GROUPS[product.theme] ?? []), ...(GROUPS[product.category] ?? [])];
  const hit = match(evidence.negativeText, terms)[0];
  if (hit) return `Conflicts with an explicit exclusion: “${hit}”.`;
  if (match(evidence.negativeText, GROUPS.home).length && product.category === 'pillow') return 'Conflicts with your home decor exclusion.';
  return null;
}
export function recommend(input, {excludedIds = [], excludedCategories = [], limit = 3} = {}) {
  const validated = validateProfile(input);
  if (!validated.valid) return { engine: ENGINE, status: 'invalid', errors: validated.errors, recommendations: [], rejected: [] };
  const profile = validated.profile;
  const evidence = extractEvidence(profile);
  const rejected = [];
  const eligible = [];
  for (const product of CATALOG) {
    const excluded = excludedBy(product, evidence, excludedIds, excludedCategories);
    if (excluded) { rejected.push({id: product.id, reason: excluded, kind:'excluded'}); continue; }
    if (product.candidatePrice > profile.budget) { rejected.push({id:product.id,reason:'Above the candidate-price budget.',kind:'budget'}); continue; }
    const reasons = [];
    let score = 0;
    const themeHits = evidence.signals[product.theme];
    if (themeHits.length) {score += 6; reasons.push({type:'preference',quote:themeHits[0],text:`Your recipient’s “${themeHits[0]}” interest connects to the ${labels[product.theme]}.`});}
    const categoryHits = evidence.signals[product.category];
    if (categoryHits.length) {score += 4; reasons.push({type:'preference',quote:categoryHits[0],text:`You mentioned “${categoryHits[0]}”; this product directly reflects that preference.`});}
    const useGroups = product.uses.filter(use=>GROUPS[use]);
    for (const use of useGroups) if (evidence.signals[use]?.length) {score += 3; reasons.push({type:'preference',quote:evidence.signals[use][0],text:`It could suit their interest in ${labels[use] ?? use}.`});}
    if (!score) { rejected.push({id:product.id,reason:'No supported recipient-preference signal.',kind:'evidence'}); continue; }
    reasons.push({type:'budget',text:`Candidate price ${product.candidatePrice} is within your ${profile.budget} demo-unit budget; this is not a delivered quote.`});
    eligible.push({product,score,reasons,fitLabel: new Set(reasons.filter(r=>r.type==='preference').map(r=>r.quote)).size >= 2 ? 'Two or more preference signals' : 'One preference signal'});
  }
  // Stable order; budget never wins over recipient evidence. Diversity breaks equal scores only.
  eligible.sort((a,b)=>b.score-a.score || a.product.candidatePrice-b.product.candidatePrice || a.product.id.localeCompare(b.product.id));
  const recommendations = eligible.slice(0, Math.max(1, Math.min(8, limit)));
  let emptyReason = null;
  if (!recommendations.length) {
    if (profile.budget < Math.min(...CATALOG.map(p=>p.candidatePrice))) emptyReason = 'This prototype catalog starts at 89 demo units. Nothing fits your budget, so we will not stretch it or substitute supplier cost for retail.';
    else if (rejected.every(r=>r.kind==='excluded'||r.kind==='budget')) emptyReason = 'Nothing remains within your budget after the explicit exclusions. Change a constraint only if it truly fits your recipient.';
    else emptyReason = 'We do not have enough matching evidence in this small catalog. Try specific recipient interests such as ocean, astronomy, gardening, travel, hosting or home decor, or keep the brief for a different catalog.';
  }
  return {engine:ENGINE,status:recommendations.length?'matched':'no-match',profile,evidence,notices:evidence.notices,recommendations,rejected,eligibleCount:eligible.length,emptyReason,catalogInfo:CATALOG_INFO};
}
