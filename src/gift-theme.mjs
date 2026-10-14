// Literal merchant evidence only. Theme matching is not a licensing/authenticity claim.
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/<[^>]*>/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
export function requiredThemePhrases(query = '') {
  const text = typeof query === 'string' ? query.slice(0,240) : '';
  const phrases = [];
  const knownThemes = ['Star Wars','Star Trek','Harry Potter','The Lord of the Rings','Lord of the Rings','Studio Ghibli','Hello Kitty','Pokémon','Pokemon','Minecraft','Super Mario','Animal Crossing','Dungeons and Dragons','Dungeons & Dragons','LEGO','Marvel'];
  for (const theme of knownThemes) if (` ${normalize(text)} `.includes(` ${normalize(theme)} `) && !phrases.some(p => normalize(p).includes(normalize(theme)))) phrases.push(theme);
  for (const match of text.matchAll(/["“]([^"“”]+)["”]/g)) if (normalize(match[1])) phrases.push(match[1].trim());
  const seen = new Set();
  return phrases.filter(phrase => {const key=normalize(phrase);if(seen.has(key))return false;seen.add(key);return true;});
}
function evidenceStrings(value, depth=0) {
  if(depth>5||value==null)return [];
  if(typeof value==='string')return [value];
  if(Array.isArray(value))return value.flatMap(v=>evidenceStrings(v,depth+1));
  if(typeof value==='object')return Object.entries(value).filter(([key])=>!/^(?:id|url|image|media|handle|sku)$/i.test(key)).flatMap(([,v])=>evidenceStrings(v,depth+1));
  return [];
}
function positiveMention(text, phrase) {
  const needle=normalize(phrase);
  // Keep sentence/clause boundaries before normalizing punctuation away. A
  // disclaimer in one clause cannot negate a positive title or another clause.
  for (const clause of String(text).replace(/<[^>]*>/g,' ').split(/[.!?;]|\b(?:but|however|whereas)\b/i)) {
    const normalized=normalize(clause);
    const haystack=` ${normalized} `;const term=` ${needle} `;
    let offset=0,index;
    while((index=haystack.indexOf(term,offset))!==-1){
      const before=haystack.slice(0,index).trim().split(' ').slice(-12).join(' ');
      const after=haystack.slice(index+term.length).trim();
      const deniedBefore=/\b(?:not|no|never|without|unrelated to|unaffiliated with|unlike|isn t|isnt|doesn t|doesnt)\b/.test(before);
      const deniedAfter=/^(?:(?:products?|theme|design|merchandise) )?(?:is |are |was |were )?(?:not|unrelated|excluded|absent)\b/.test(after);
      if(!deniedBefore&&!deniedAfter)return true;
      offset=index+term.length;
    }
  }
  return false;
}
export function assessTheme(product, variant, query = '') {
  const requiredPhrases = requiredThemePhrases(query);
  const evidence=[product,variant].flatMap(item=>['title','description','category','metadata'].flatMap(key=>evidenceStrings(item?.[key])));
  const missingPhrases=requiredPhrases.filter(phrase=>!evidence.some(text=>positiveMention(text,phrase)));
  return {eligible:!missingPhrases.length,requiredPhrases,missingPhrases,reason:missingPhrases.length?'The merchant listing does not explicitly substantiate the required search theme.':requiredPhrases.length?'Merchant text explicitly mentions the requested theme; licensing and authenticity are not verified.':'No explicit named or quoted theme required.'};
}
export function themeSearchQuery(query = '', originalQuery = '') {
  const original=String(originalQuery).trim().slice(0,240);
  const model=String(query).trim().slice(0,240);
  const phrases=requiredThemePhrases(original);
  if (!phrases.length) return (model || original).slice(0,240);
  // One concrete product category at most. Do not re-append the entire profile,
  // demographic labels, expression or occasion as a giant AND-style query.
  const category = model.match(/\b(?:board games?|card games?|coffee mugs?|mugs?|cups?|tumblers?|books?|puzzles?|figurines?|collectibles?|prints?|posters?|art|games?|t shirts?|shirts?|hoodies?|socks?|bags?|wallets?|necklaces?|jewelry|jewellery|keychains?|lamps?|watches?|greeting cards?|cards?|gifts?)\b/i)?.[0] ?? '';
  return [...phrases,category].filter(Boolean).join(' ').slice(0,240).trimEnd();
}
