/** Pure automatic search planning. Extract product-interest vocabulary, not a
 * recipient biography. No names, raw preference sentences, occasion, relationship,
 * expression, or private fields are passed through to a search provider.
 * Apply audienceSearchQuery at the call site, exactly once.
 */
import { extractEvidence } from './recommender.mjs';

const THEMES = [
  'Star Wars', 'Star Trek', 'Harry Potter', 'Lord of the Rings', 'The Lord of the Rings',
  'Studio Ghibli', 'Hello Kitty', 'Pokémon', 'Pokemon', 'Minecraft', 'Super Mario',
  'Animal Crossing', 'Dungeons and Dragons', 'Dungeons & Dragons', 'LEGO', 'Marvel',
];
const EXPLICIT_PRODUCT_INTENTS = ['greeting cards', 'birthday cards', 'greeting card', 'birthday card'];
const INTERESTS = [
  ...EXPLICIT_PRODUCT_INTENTS,
  'Japanese ceramics', 'ceramic art', 'home decor', 'board games', 'video games',
  'science fiction', 'sci fi', 'dinner parties', 'pocket squares', 'pocket square',
  'rock climbing', 'bird watching', 'birdwatching', 'woodworking', 'leatherworking',
  'coffee brewing', 'specialty coffee', 'loose leaf tea', 'tea ceremony',
  'astronomy', 'stargazing', 'space', 'galaxies', 'galaxy', 'planets', 'celestial',
  'ocean', 'seaside', 'beach', 'coastal', 'nautical', 'surfing', 'sailing',
  'gardening', 'botanical', 'plants', 'flowers', 'forest', 'woodland',
  'architecture', 'geometric', 'mountains', 'landscape', 'retro',
  'cooking', 'baking', 'kitchen', 'tableware', 'hosting', 'cocktails',
  'travel', 'hiking', 'camping', 'cycling', 'running', 'fishing', 'golf', 'tennis',
  'basketball', 'football', 'soccer', 'yoga', 'fitness', 'swimming', 'skiing',
  'reading', 'books', 'poetry', 'journaling', 'stationery', 'calligraphy',
  'drawing', 'painting', 'art', 'pottery', 'ceramics', 'crafts', 'knitting', 'crochet',
  'movies', 'movie', 'films', 'film', 'cinema',
  'photography', 'music', 'guitar', 'piano', 'jazz', 'vinyl', 'gaming', 'puzzles',
  'coffee', 'tea', 'chocolate', 'cats', 'dogs', 'birds', 'dinosaurs',
  'fashion', 'silk', 'linen', 'accessories', 'jewelry', 'jewellery', 'necklace',
  'pillow', 'cushion', 'tote', 'bag', 'towel', 'napkins', 'candles',
  'minimalist', 'colorful', 'vintage', 'handmade', 'practical', 'useful',
];
const SAFE_QUOTE_WORDS = new Set((INTERESTS.join(' ') + ' quiet mornings slow handmade modern classic contemporary traditional sustainable recycled reusable cozy cosy natural wooden wood ceramic glass porcelain cotton wool brass silver gold blue green red black white pink floral geometric botanical ocean celestial Japanese Nordic Scandinavian Italian French British Korean Chinese vintage antique minimalist design designs crafts craft').toLowerCase().split(/\s+/));
const normal = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[’]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const contains = (text, term) => (` ${normal(text)} `).includes(` ${normal(term)} `);
function hasPrivateMarker(text) {
  return /[@\d]|https?:|www\.|\b(?:i|me|my|we|our|he|she|they|his|her|their|name|email|address|street|avenue|road|lane|apartment|phone|password|diagnosis|diagnosed|cancer|hiv|diabetes|pregnan\w*|medication|depression|disease|disorder|treatment|therapy|medical|health|salary|income|account|passport|lives?|works?|employer|born|married|divorced|patient|hospital|clinic|contact)\b/i.test(text);
}

// A bounded preference noun phrase is allowed to be novel. Never pass a whole
// sentence or biography through simply because it followed a preference verb.
function safeInterestPhrase(value) {
  const phrase = value.trim().replace(/^["“]|["”]$/g,'').replace(/\s+/g,' ');
  const words = normal(phrase).split(' ');
  if (phrase.length < 2 || phrase.length > 65 || words.length > 5 || hasPrivateMarker(phrase)) return null;
  if (!/^[\p{L}][\p{L}\s'-]*$/u.test(phrase)) return null;
  if (/\b(?:is|are|was|were|has|have|had|that|who|whose|because|with|from|at|in|to|for|and|or|but|likes?|loves?|enjoys?|collects?|prefers?|mentioned|says?|feels?|needs?|wants?)\b/i.test(phrase)) return null;
  // Unknown multiword title-case strings can be people's names. Existing public
  // themes and generic vocabulary remain available through their own path.
  if (words.length > 1 && phrase.split(/\s+/).every(word => /^[A-Z][a-z]+$/.test(word))
    && !words.every(word => SAFE_QUOTE_WORDS.has(word))) return null;
  return phrase;
}

// Split only a complete sequence of recognized interests, using longest phrases
// first. Unknown compounds (e.g. hiking boots, mechanical keyboards) stay whole.
// Explicit commas/and already separate novel interests through the existing path.
function adjacentInterests(value) {
  const words=normal(value).split(' ');
  const vocabulary=[...THEMES,...INTERESTS].map(term=>({term,words:normal(term).split(' ')})).sort((a,b)=>b.words.length-a.words.length);
  const parts=[];let position=0;
  while(position<words.length){const found=vocabulary.find(item=>item.words.every((word,index)=>words[position+index]===word));if(!found)return [value];parts.push(found.term);position+=found.words.length;}
  return parts.length>1?parts:[value];
}

function collectSearchTerms(profile = {}) {
  const likes = typeof profile?.likes === 'string' ? profile.likes.slice(0,1200) : '';
  const dislikes = typeof profile?.dislikes === 'string' ? profile.dislikes.slice(0,1200) : '';
  const evidence = extractEvidence({ likes, dislikes, selfGift: profile?.selfGift === true, relationship: profile?.relationship });
  const positive = evidence.positiveText;
  const negative = evidence.negativeText;
  // Names are used exclusively as a local denylist, never as search material.
  const nameTokens = normal(profile?.recipient).split(' ').filter(token => token.length > 1);
  const safe = term => !nameTokens.some(token => contains(term,token))
    && !contains(negative,term)
    && !normal(term).split(' ').some(token => token.length > 2 && contains(negative,token));
  const terms = [];
  const add = term => {
    if (!safe(term) || terms.some(existing => contains(existing,term))) return;
    // Preserve the longer named phrase instead of duplicated component words.
    for (let i = terms.length - 1; i >= 0; i--) if (contains(term,terms[i])) terms.splice(i,1);
    terms.push(term);
  };
  for (const theme of THEMES) if (contains(positive,theme)) add(theme);
  // Common spelling/Chinese aliases map to the public theme, never raw prose.
  if (/(?:\bstarwars\b|星球大战|星際大戰|星际大战)/i.test(positive)
    && !/(?:\bstarwars\b|星球大战|星際大戰|星际大战)/i.test(negative)
    && !/(?:不喜欢|討厭|讨厌|不要|不想要)\s*(?:星球大战|星際大戰|星际大战)/.test(positive)) add('Star Wars');
  const themes = [...terms];
  const addNovel = value => {
    const phrase = safeInterestPhrase(value);
    if (!phrase || !safe(phrase)) return;
    add(phrase);
    if (/^[A-Z][a-zA-Z]+$/.test(phrase) && !INTERESTS.some(term => normal(term) === normal(phrase))) themes.push(phrase);
  };
  for (const match of positive.matchAll(/["“]([^"“”\n]{2,70})["”]/g)) addNovel(match[1]);
  // extractEvidence has already removed giver and negative clauses. Retain only
  // short lists after an explicit preference verb, or a short standalone list.
  const clauses = positive.split(/(?=\b(?:they|he|she|the recipient|I)\s)/i);
  for (const clause of clauses) {
    const preference = /\b(?:likes?|loves?|enjoys?|collects?|prefers?)\s+(.+)$/i.exec(clause);
    const list = preference ? preference[1] : clause;
    for (const part of list.split(/,|\band\b|\bor\b|&/i)) for(const interest of adjacentInterests(part)) addNovel(interest);
  }
  for (const interest of INTERESTS) if (contains(positive,interest)) add(interest);
  const genericAudience = profile?.audience && profile.audience !== 'any' ? '' : (() => {
    const men = /\b(?:men(?:['’]s)?|man|male)\b|男人|男士|男性/i.test(positive);
    const women = /\b(?:women(?:['’]s)?|woman|female)\b|女人|女士|女性/i.test(positive);
    const unisex = /\bunisex\b|男女通用/i.test(positive);
    return unisex ? 'unisex' : men === women ? '' : men ? "men's" : "women's";
  })();
  return { themes, terms, genericAudience };
}

/** Focused retrieval plan. A named theme is primary evidence, not one more
 * keyword in a restrictive AND query. Demographic/style constraints belong in
 * ranking; callers must not append them when hasTheme is true.
 */
export function buildGiftSearchPlan(profile = {}) {
  const { themes, terms, genericAudience } = collectSearchTerms(profile);
  if (themes.length) return { queries: [...new Set(themes)].slice(0,3), hasTheme: true };
  const explicit = terms.filter(term => EXPLICIT_PRODUCT_INTENTS.some(intent => normal(intent) === normal(term)));
  const prioritized = [...explicit, ...terms.filter(term => !explicit.includes(term))];
  const queries = [...new Set(prioritized.map(term => [term,genericAudience,'gifts'].filter(Boolean).join(' ')))].slice(0,3);
  return { queries: queries.length ? queries : [[genericAudience,'meaningful gifts'].filter(Boolean).join(' ')], hasTheme: false };
}

export function buildGiftSearchQuery(profile = {}) {
  return buildGiftSearchPlan(profile).queries[0];
}
