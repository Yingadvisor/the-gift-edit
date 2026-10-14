import {extractEvidence} from './recommender.mjs';
import {assessExclusions,EXCLUSION_FACTORS} from './exclusion-factors.mjs';
import {CATALOG,CATALOG_INFO} from './catalog.mjs';
export const CUSTOM_PRODUCTS=Object.freeze([
  ['pillow','Pillow','celestial-pillow'],['tote','Tote','passage-tote'],['towels','Tea towels','botanica-towels'],['pocket-square','Pocket square','celestial-square'],['napkins','Cocktail napkins','ocean-napkins']
].map(([id,label,reference])=>Object.freeze({id,label,reference:CATALOG.find(p=>p.id===reference)})));
export const CUSTOM_MOTIFS=Object.freeze(['celestial','ocean','botanical','geometric'].map(id=>{
  const reference=CATALOG.find(p=>p.theme===id&&p.category==='pillow');
  return Object.freeze({id,label:reference.artwork,reference});
}));
const EXPRESSIONS=Object.freeze([
  {motifId:'ocean',meaning:'protection',pattern:/\b(protect(?:ion|ive)?|safety|safe|shelter)\b|守护|保护|庇护|平安/iu,interpretation:'The shell and surrounding waves can suggest shelter and protection in this design.'},
  {motifId:'geometric',meaning:'courage',pattern:/\b(courage|brave(?:ry)?|bold|strength)\b|勇气|勇敢|坚强/iu,interpretation:'The path through mountains and arches can suggest courage to move forward in this design.'},
  {motifId:'celestial',meaning:'enduring companionship',pattern:/\b(companionship|together|enduring|always|forever)\b|陪伴|长久|相伴|永远/iu,interpretation:'The stars and orbital lines can suggest enduring companionship in this design.'},
  {motifId:'botanical',meaning:'new beginnings',pattern:/\b(new beginnings?|fresh start|renewal|growth|new chapter)\b|新开始|新的开始|新生|新篇章|成长/iu,interpretation:'The leaves and flowers can suggest growth and new beginnings in this design.'}
]);
/** Transparent keyword suggestions, not AI inference or universal cultural symbolism. */
export function rankCustomMotifs(expression=''){
  const text=String(expression||'').normalize('NFKC');
  return CUSTOM_MOTIFS.map((motif,index)=>{
    const theme=EXPRESSIONS.find(item=>item.motifId===motif.id);
    const matched=theme.pattern.test(text);
    return {...motif,score:matched?1:0,meaning:theme.meaning,interpretation:theme.interpretation,matched,index};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
}
export const CUSTOM_PATTERN_IMAGES=Object.freeze({
  celestial:'/assets/celestial-voyager-original-pattern.png',
  ocean:'/assets/ocean-reverie-original-pattern.png',
  botanical:'/assets/moonlit-botanica-original-pattern.png',
  geometric:'/assets/golden-passage-original-pattern.png'
});
export const ATELIER_URL=CATALOG_INFO.atelierUrl;
export function customSelection(productId,motifId){
  const product=CUSTOM_PRODUCTS.find(p=>p.id===productId);
  const motif=CUSTOM_MOTIFS.find(m=>m.id===motifId);
  if(!product||!motif)return null;
  const prototype=CATALOG.find(p=>p.category===productId&&p.theme===motifId)||null;
  return {product,motif,prototype,status:prototype?'Existing digital prototype':'Concept not rendered'};
}
export function customBrief(profile,selection){
  if(!selection)throw new Error('Choose a product and an original motif first.');
  const p=profile||{};
  const exclusions=Array.isArray(p.excludedFactors)?p.excludedFactors.map(f=>typeof f==='string'?f:f.label||f.id).join(', '):String(p.excludedFactors||'');
  return [
    'CUSTOM GIFT CONCEPT · THE GIFT EDIT',
    `Recipient: ${p.relationship==='Myself'||p.selfGift?'You':p.recipient||'Not specified'}`,
    `Relationship: ${p.relationship||'Not specified'}`,
    `Occasion: ${p.occasion||'Not specified'}`,
    `Adult age band: ${p.ageBand||'Not specified'}`,
    `Intended audience: ${p.audience||'Any'}`,
    `Style: ${p.style||'Any'}`,
    `Lifestyle: ${p.lifestyle||'Any'}`,
    `Likes: ${p.likes||'Not specified'}`,
    `What we want to express: ${p.expression||'Not specified'}`,
    `Avoid: ${p.dislikes||'None stated'}`,
    `Quick exclusions: ${exclusions||'None selected'}`,
    `Planning budget: ${p.budget||'Not specified'}${p.budget?' USD':''}; not a custom quote. Shipping and tax unverified.`,
    `Must arrive by: ${p.arrivalDeadline||'Not specified'}; manufacturing and delivery unverified. No date promise.`,
    `Product: ${selection.product.label}`,
    `Original motif: ${selection.motif.label}`,
    `Design interpretation: ${rankCustomMotifs(p.expression).find(item=>item.id===selection.motif.id).interpretation} This is a proposed reading of this original design, not a universal cultural meaning.`,
    `Preview status: ${selection.status}. ${selection.prototype?'Digital render, not a physical sample.':'This combination has no existing product render; the motif reference is shown separately on a pillow.'}`,
    'This is a design direction, not a purchasable listing. Materials, production feasibility, availability, price and delivery require separate confirmation. Preferences are carried over, not a claim that this concept satisfies every exclusion.',
    `Optional manual handoff: ${ATELIER_URL}`,
    'No automatic brief transfer, order or payment. Use original artwork you have rights to; no licensed film or game artwork.'
  ].join('\n');
}

/** Original-prototype discovery only: never stock, price or licensed-IP matching. */
export function relevantCustomConcepts(profile={}, {browseAll=false}={}){
  const evidence=extractEvidence(profile);
  const franchise=/\bstar\s*wars\b|\bharry\s*potter\b|\bmarvel\b|\bdisney\b|\bpok[eé]mon\b|\bminecraft\b|\bzelda\b|\blord of the rings\b|星球大战|星战|哈利波特|宝可梦|漫威/iu.test(String(profile.likes||''));
  // Negative text is intentionally treated as plain terms for conservative exclusion.
  const negativeTerms=extractEvidence({likes:evidence.negativeText.replace(/\b(no|not|never|avoid|dislikes?|hates?|without|doesn't|don't)\b/gi,''),selfGift:true});
  const factors=(profile.excludedFactors||[]).map(f=>typeof f==='string'?(EXCLUSION_FACTORS.find(x=>x.id===f||x.label===f)?.id||f):f.id);
  const expressions=rankCustomMotifs(profile.expression);
  const cards=[];
  for(const prototype of CATALOG){
    const forbidden=[...prototype.materials,...prototype.colors,...prototype.motifs];
    const rawNegative=String(evidence.negativeText).toLowerCase();
    const wordHit=forbidden.some(term=>new RegExp(`\\b${term}s?\\b`,'i').test(rawNegative));
    if(wordHit||negativeTerms.signals[prototype.theme]?.length||negativeTerms.signals[prototype.category]?.length)continue;
    if((profile.excludedIds||[]).includes(prototype.id)||(profile.excludedCategories||[]).some(c=>[prototype.category,`title:${prototype.category}`,prototype.name].includes(c)))continue;
    const assessed=assessExclusions({title:prototype.name,category:prototype.category,description:prototype.specifications,metadata:{materials:prototype.materials}},null,factors);
    if(assessed.matches.length)continue;
    const meaning=expressions.find(item=>item.id===prototype.theme);
    const theme=evidence.signals[prototype.theme]||[],category=evidence.signals[prototype.category]||[];
    const reasons=[];
    if(theme.length)reasons.push(`Your stated interest in “${theme[0]}” connects to this original imagery.`);
    if(category.length)reasons.push(`You mentioned “${category[0]}”; this is that product type.`);
    if(meaning.matched)reasons.push(`Possible expression of ${meaning.meaning}: ${meaning.interpretation}`);
    if(!browseAll&&(franchise||!reasons.length))continue;
    cards.push({prototype,selection:customSelection(prototype.category,prototype.theme),reasons:browseAll?['Exploration only, not a recommendation or a franchise match.']:reasons,score:theme.length*3+category.length*2+Number(meaning.matched),unknownFactors:assessed.unknown});
  }
  cards.sort((a,b)=>b.score-a.score||CATALOG.indexOf(a.prototype)-CATALOG.indexOf(b.prototype));
  return {cards,franchise,browseAll,notice:franchise?'No original design match for the requested franchise. Generic celestial imagery is not Star Wars or other licensed artwork.':cards.length?'Only original prototypes connected to your stated interests or expression are shown.':'No original design match for these interests and constraints. We will not substitute unrelated ocean or botanical designs.',evidenceNotices:evidence.notices};
}
