import {validateGiftContext,EXPRESSION_CHOICES,combinedExpression} from './gift-context.mjs';
export {EXPRESSION_CHOICES,combinedExpression};
import {buildGiftSearchQuery,buildGiftSearchPlan} from './gift-search.mjs';
export {buildGiftSearchQuery,buildGiftSearchPlan};
import {validateAudienceContext,audienceSearchQuery,assessAudience} from './audience-context.mjs';
import {assessTheme} from './gift-theme.mjs';
export {audienceSearchQuery,assessAudience};
import {assessArrival,validArrivalDate} from './delivery-deadline.mjs';
export {assessArrival,validArrivalDate};
import {assessGiftRole, primaryGiftValueScore} from './gift-quality.mjs';
export {summarizeGiftSet, canAddToGiftSet, setItemKey} from './gift-set.mjs';
import {EXCLUSION_FACTORS, assessExclusions} from './exclusion-factors.mjs';
export {EXCLUSION_FACTORS, assessExclusions};
import {validateProfile, extractEvidence} from './recommender.mjs';
export const SHOP_CONTEXT=Object.freeze({country:'US',currency:'USD',label:'US / USD demo market'});
export const SHOP_ENGINE=Object.freeze({id:'shop-mcp-rules-v1',modelConnected:false,label:'Shop catalog + transparent rules',disclosure:'Shop MCP supplies live product data. Ranking is rules-based; no AI model is connected.'});
export function safeHttpsUrl(value){
  if(typeof value!=='string')return null;
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hostname==='localhost'||/^\d+(\.\d+){3}$/.test(u.hostname)||u.hostname.includes(':'))return null;return value;}catch{return null;}
}
export function formatMoney(price){if(!Number.isSafeInteger(price?.amount)||typeof price?.currency!=='string')return 'Price unavailable';try{const f=new Intl.NumberFormat('en-US',{style:'currency',currency:price.currency});return f.format(price.amount/10**f.resolvedOptions().maximumFractionDigits)+' '+price.currency;}catch{return 'Price unavailable';}}
export function validateShopProfile(input){const selfGift=input?.relationship==='Myself';const r=validateProfile(selfGift?{...input,recipient:'You'}:input);const query=String(input?.query??'').trim();if(!query||query.length>240)r.errors.push('Add recipient interests so we can find a gift.');const expression=String(input?.expression??'').trim();if(expression.length>400)r.errors.push('Keep the intended expression under 400 characters.');const arrivalDeadline=input?.mustArrive===true||input?.mustArrive==='on'?String(input?.arrivalDeadline??''):null;if(arrivalDeadline!==null&&!validArrivalDate(arrivalDeadline))r.errors.push('Choose a valid must-arrive-by date.');let giftContext={style:'any',lifestyle:'any'};try{giftContext=validateGiftContext({style:input?.style,lifestyle:input?.lifestyle});}catch{r.errors.push('Choose supported optional style and lifestyle values.');}let context={audience:'any',ageBand:'any'};try{context=validateAudienceContext({audience:input?.audience,ageBand:input?.ageBand},query);}catch{r.errors.push('Choose supported optional adult age and audience values.');}return {...r,valid:!r.errors.length,profile:{...r.profile,...giftContext,query,expression,arrivalDeadline,selfGift,audience:context.audience,ageBand:context.ageBand,audienceNotice:context.notice}};}
const normal=s=>String(s??'').toLowerCase().replace(/[’]/g,"'").replace(/<[^>]*>/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const STOP=new Set('a an the they their them he she her his is are was were loves love likes like enjoys enjoy with and or for of to in at from my your recipient someone person friend friends very really about things that this it its have has who whom than much something anything'.split(' '));
const stem=s=>s.length>4&&s.endsWith('ing')?s.slice(0,-3):s.length>3&&s.endsWith('s')?s.slice(0,-1):s;
const aliases=[['ocean','sea','beach','coastal','seaside','nautical','waves'],['flower','flowers','floral','florals'],['garden','gardening','plants','botanical','botanicals'],['space','astronomy','celestial','stars','galaxy'],['pillow','pillows','cushion','cushions'],['bag','bags','tote','totes'],['host','hosting','entertaining','tableware'],['shell','shells','nautilus'],['moon','moons']];
const tokens=s=>[...new Set(normal(s).split(' ').filter(x=>x.length>2&&!STOP.has(x)))];
function expanded(words){const set=new Set(words.map(stem));for(const group of aliases)if(group.some(w=>set.has(stem(w))))group.forEach(w=>set.add(stem(w)));return set;}
export function productCategory(product){
  const c=product?.category;
  let category=null;
  if(typeof c==='string'&&c)category={id:c,label:c.split('>').pop().trim()};
  else if(c&&typeof c==='object'&&typeof c.id==='string')category={id:c.id,label:c.name||c.title||'this category'};
  const title=normal(product?.title);
  // Keep existing exclusion IDs stable; grouping is a separate broad, bounded
  // presentation/retrieval concept, shared across merchant-specific taxonomies.
  if(!category)for(const [label,pattern] of [['pillows',/\b(pillow|cushion)s?\b/],['mugs',/\b(mug|cup)s?\b/],['totes',/\b(tote|bag)s?\b/],['napkins',/\bnapkins?\b/],['towels',/\btowels?\b/],['jewelry',/\b(necklace|bracelet|earring|jewelry)s?\b/],['candles',/\bcandles?\b/]])if(pattern.test(title)){category={id:`title:${label}`,label};break;}
  // Classify only literal product/category words, never recipient stereotypes,
  // prices, artwork themes, or vendor-specific IDs. Unknowns share one cap.
  const metadata=typeof c==='string'?c:c&&typeof c==='object'?[c.name,c.title].filter(x=>typeof x==='string').join(' '):'';
  const text=normal(`${metadata} ${title}`);
  const groups=[
    ['clothing','Clothing',/\b(?:apparel|clothing|t shirts?|tee shirts?|tees?|shirts?|hoodies?|sweatshirts?|sweaters?|cardigans?|jackets?|coats?|socks?|hats?|caps?|scarves|scarfs?|pants|trousers|dresses|skirts?|pajamas|pyjamas|shoes?|footwear)\b/],
    ['drinkware','Mugs & drinkware',/\b(?:drinkware|mugs?|cups?|tumblers?|water bottles?|drinking glasses|wine glasses|teapots?|teacups?|goblets?)\b/],
    ['jewelry','Jewelry',/\b(?:jewelry|jewellery|necklaces?|bracelets?|earrings?|pendants?|rings?|brooches?)\b/],
    ['stationery-books','Stationery & books',/\b(?:stationery|books?|notebooks?|journals?|planners?|pens?|pencils?|bookmarks?|greeting cards?|birthday cards?|postcards?)\b/],
    ['collectibles','Collectibles',/\b(?:collectibles?|figurines?|statuettes?|statues?|replicas?|action figures?|enamel pins?)\b/],
    ['toys-games','Toys & games',/\b(?:toys?|games?|puzzles?|plush|building sets?|building blocks?|lego)\b/],
    ['homegoods','Home goods',/\b(?:home goods|home decor|housewares|pillows?|cushions?|towels?|napkins?|candles?|blankets?|throws?|rugs?|lamps?|vases?|planters?|posters?|prints?|wall art|clocks?|coasters?|plates?|bowls?|trays?|kitchenware|tableware)\b/],
  ];
  const [groupId,groupLabel]=groups.find(([, ,pattern])=>pattern.test(text))??['other','Other / category unverified'];
  return {...(category??{id:groupId==='other'?'unknown':`group:${groupId}`,label:groupLabel}),groupId,groupLabel};
}
export function productImage(product,variant){
  const media=[...(Array.isArray(variant?.media)?variant.media:[]),...(Array.isArray(product?.media)?product.media:[])];
  const entry=media.find(m=>m&&(!m.type||m.type==='image')&&safeHttpsUrl(m.url));
  return entry?{url:entry.url,alt:entry.alt||entry.alt_text||product.title||'Merchant product image'}:null;
}
export function selectedMatches(requested,product,variant){
  const same=(a,b)=>a.length===b.length&&a.every(x=>b.some(y=>y.name===x.name&&y.label===x.label));
  return same(requested,Array.isArray(product?.selected)?product.selected:[])&&same(requested,Array.isArray(variant?.options)?variant.options:[]);
}
export function rankShopProducts(products,profile,{excludedIds=[],excludedCategories=[],excludedFactors=[],requireInterestEvidence=true,limit=10,categoryUsage={}}={}){
  const evidence=extractEvidence(profile);
  const positiveTokens=tokens(evidence.positiveText);
  const positive=expanded(positiveTokens);
  const negative=expanded(tokens(evidence.negativeText).filter(w=>!['not','never','avoid','dislike','dislikes','hate','hates','doesn','don','isn','aren','neither','nor','except'].includes(w)));
  const rejected=[];const ranked=[];const addons=[];const seenIds=new Set();
  for(const [index,product] of (Array.isArray(products)?products:[]).entries()){
    if(!product||typeof product.id!=='string'||typeof product.title!=='string'||seenIds.has(product.id))continue;
    seenIds.add(product.id);
    const category=productCategory(product);const variant=product.variants?.[0];
    const reject=reason=>rejected.push({id:product.id,reason});
    const arrival=assessArrival(product,variant,profile);if(!arrival.eligible){reject(arrival.reason);continue;}
    if(excludedIds.includes(product.id)||excludedCategories.includes(category?.id)){reject('Explicitly excluded');continue;}
    if(!variant?.id||!variant.seller?.domain){reject('Missing merchant or variant identifier');continue;}
    if(variant.price?.currency!=='USD'||!Number.isSafeInteger(variant.price?.amount)||variant.price.amount<0){reject('Price missing or not USD');continue;}
    if(variant.price.amount>Math.round(profile.budget*100)){reject('Item price exceeds budget');continue;}
    if(variant.availability?.available!==true){reject('Featured variant is not confirmed available');continue;}
    const giftRole=assessGiftRole(product,variant,{...profile,likes:evidence.positiveText});
    const audience=assessAudience(product,variant,{audience:profile.audience,ageBand:profile.ageBand},profile.query||'');if(!audience.eligible){reject(audience.reason);continue;}
    const theme=assessTheme(product,variant,profile.query||'');if(!theme.eligible){reject(theme.reason);continue;}
    const factors=assessExclusions(product,variant,excludedFactors);
    if(factors.matches.length){reject(`Excluded factor: ${factors.matches.map(x=>x.label).join(', ')}`);continue;}
    const description=value=>typeof value==='string'?value:(typeof value?.plain==='string'?value.plain:'');
    const metadata=[...(product.metadata?.tech_specs??[]),...(product.metadata?.top_features??[])].filter(x=>typeof x==='string');
    const text=[product.title,description(product.description),description(variant.description),...metadata,category?.label,...(variant.options??[]).map(o=>`${o.name} ${o.label}`)].filter(x=>typeof x==='string').join(' ');
    const words=expanded(tokens(text));
    const bad=[...negative].filter(w=>words.has(w));if(bad.length){reject(`Conflicts with stated avoidances: ${bad.slice(0,3).join(', ')}`);continue;}
    const hits=positiveTokens.filter(word=>[...expanded([word])].some(w=>words.has(w)));
    // Retain only evidence-linked matches; query relevance alone never invents recipient taste.
    const directRequest=theme.requiredPhrases.length>0||giftRole.reason.includes('explicitly request');
    if(requireInterestEvidence&&!hits.length&&giftRole.role!=='addon'&&!directRequest){reject('No explicit recipient-interest overlap in the returned details');continue;}
    const titleWords=expanded(tokens(product.title));const score=hits.length+hits.filter(word=>[...expanded([word])].some(w=>titleWords.has(w))).length;
    (giftRole.role==='addon'?addons:ranked).push({product,variant,category,index,score,audienceUnknown:audience.status==='unknown'?audience.reason:null,giftRole:giftRole.role,giftRoleReason:giftRole.reason,valueScore:primaryGiftValueScore(variant.price.amount,profile.budget),factorUnknowns:factors.unknown,evidence:[...new Set(hits)].slice(0,3),image:productImage(product,variant),url:safeHttpsUrl(variant.url),reasons:[giftRole.role==='addon'?'Optional add-on from the current catalog search, not a primary gift.':!hits.length&&directRequest?'The merchant listing supports your explicit search request; this does not infer an additional recipient interest.':`The returned product details connect to your recipient’s stated interest: ${[...new Set(hits)].slice(0,3).join(', ')}.`,`The current featured item price is ${formatMoney(variant.price)}, before tax and shipping.`]});
  }
  // Interest evidence remains the strongest signal. Value and category variety are
  // soft tie-breakers, never minimum-spend or minimum-count requirements.
  const recommendations=[];const categoryCounts=new Map();
  // A caller may seed counts from already-displayed pages. Copy and validate;
  // never mutate caller data or allow negative/fractional counts to evade caps.
  if(categoryUsage&&typeof categoryUsage==='object'&&!Array.isArray(categoryUsage))for(const [key,count] of Object.entries(categoryUsage)){
    if(Number.isFinite(count)&&count>=0)categoryCounts.set(key,Math.min(5,Math.ceil(count)));
  }
  const group=item=>item.category?.groupId??'other';
  const rankScore=item=>item.score+item.valueScore-0.75*(categoryCounts.get(group(item))??0);
  const capped=item=>(categoryCounts.get(group(item))??0)>=5;
  const count=item=>categoryCounts.set(group(item),(categoryCounts.get(group(item))??0)+1);
  while(ranked.length&&recommendations.length<Math.max(1,Math.min(40,Number.isInteger(limit)?limit:10))){
    ranked.sort((a,b)=>rankScore(b)-rankScore(a)||b.score-a.score||a.index-b.index);
    const next=ranked.shift();
    if(capped(next)){rejected.push({id:next.product.id,reason:`Category limit reached: at most 5 in ${next.category?.groupLabel??'Other'}.`});continue;}
    recommendations.push(next);count(next);
  }
  const selectedAddons=[];
  for(const addon of addons){
    if(selectedAddons.length>=5)break;
    if(capped(addon))continue;
    selectedAddons.push(addon);count(addon);
  }
  return {recommendations,addons:selectedAddons,rejected,notices:[...evidence.notices,...(profile.audienceNotice?[profile.audienceNotice]:[])],engine:SHOP_ENGINE};
}
export function shopBrief(profile,rec,{excludedFactors=[]}={}){return [
  'GIFT BRIEF · THE GIFT EDIT',`Recipient: ${profile.recipient}`,`Relationship: ${profile.relationship||'Not specified'}`,`Occasion: ${profile.occasion||'Just because'}`,`What to express: ${profile.expression||'Not specified'}`,`Aesthetic style: ${profile.style||'any'}`,`Lifestyle context: ${profile.lifestyle||'any'}`,`Adult age band: ${profile.ageBand||'any'}`,`Intended audience: ${profile.audience||'any'}`,`Recipient likes: ${profile.likes}`,`Avoid: ${profile.dislikes||'None stated'}`,`Item-price budget: ${profile.budget} USD (tax and shipping extra)`,
  `Must arrive by: ${profile.arrivalDeadline||'Not specified'} (not verified by this catalog; no delivery promise)`,`Quick exclusions: ${EXCLUSION_FACTORS.filter(x=>excludedFactors.includes(x.id)).map(x=>x.label).join(', ')||'None selected'}`,`Cannot verify from returned details: ${(rec.factorUnknowns??[]).map(x=>x.label).join(', ')||'No selected factor flagged as unknown; not a merchant guarantee'}`,
  `Shop product: ${rec.product.title}`,`Merchant: ${rec.variant.seller.name||rec.variant.seller.domain}`,`Current featured price: ${formatMoney(rec.variant.price)}`,`Product link: ${rec.url||'Unavailable'}`,
  'Catalog prices and stock can change. Refresh the exact variant before checkout. The buyer reviews final terms, shipping and taxes and pays on the merchant page.',
  'Ranking is rules-based, not an LLM recommendation.'
].join('\n');}
