import { CATALOG_INFO } from './catalog.mjs';
export function buildBrief(profile, recommendation, {excludedCategories = [], excludedIds = []} = {}) {
  const p = recommendation.product;
  return [
    'GIFT DESIGN BRIEF · THE GIFT EDIT',
    `Recipient: ${profile.recipient}`,
    `Relationship to giver: ${profile.relationship || 'Not specified'}`,
    `Occasion: ${profile.occasion || 'Just because'}`,
    `Recipient likes (provided by giver): ${profile.likes}`,
    `Recipient dislikes / must-avoid: ${profile.dislikes || 'None stated'}`,
    `Excluded categories: ${excludedCategories.join(', ') || 'None'}`,
    `Excluded prototype IDs: ${excludedIds.join(', ') || 'None'}`,
    `Budget ceiling: ${profile.budget} demo units (currency unverified; not an all-in delivered budget)`,
    '',
    `Selected prototype: ${p.artwork} — ${p.name}`,
    `Specifications: ${p.specifications}`,
    `Candidate price: ${p.candidatePrice} demo units; not a saved retail price`,
    `Why it was suggested: ${recommendation.reasons.filter(r=>r.type==='preference').map(r=>r.text).join(' ')}`,
    '',
    'Original-art direction: Retain this original artwork’s visual language. Do not introduce franchise characters, logos or affiliation claims.',
    'Before ordering: verify actual currency, final price, shipping, taxes, delivery timing, availability, production-file suitability and fulfillment.',
    'This is a rules-based recommendation, not an AI-generated design or a checkout.',
    `Expression Atelier: ${CATALOG_INFO.atelierUrl}`,
    'Manual next step: copy this brief, open Expression Atelier, and use it yourself. No parameter transfer, automatic ingestion or purchasing integration has been verified.'
  ].join('\n');
}
