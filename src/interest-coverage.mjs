/** Pure evidence-based coverage of independent interests. No I/O or inferred inventory. */
import {buildGiftSearchPlan} from './gift-search.mjs';
const normal=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/<[^>]*>/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const stop=new Set('gift gifts for men man women woman unisex adult adults meaningful a an the and or of'.split(' '));
const stem=word=>word.length>3&&word.endsWith('s')?word.slice(0,-1):word;
const aliases=[['movie','movies','film','films','cinema','cinematic'],['hiking','hike','hikes','trekking','trek','trail','trails'],['gardening','garden','gardens','horticulture','botanical','plants'],['coffee','espresso','cappuccino'],['pottery','ceramic','ceramics'],['cycling','bicycle','bicycles','bike','bikes']];
const words=value=>normal(value).split(/\s+/).filter(word=>word.length>1&&!stop.has(word)).map(stem);
function expanded(value){const out=new Set(words(value));for(const group of aliases)if(group.some(word=>out.has(stem(word))))for(const word of group)out.add(stem(word));return out;}
const plain=value=>typeof value==='string'?value:typeof value?.plain==='string'?value.plain:'';
export function interestQueries(profile){const plan=buildGiftSearchPlan(profile);return plan.hasTheme?[]:plan.queries.slice(0,3);}
export function interestMatches(product,variant,queries){
 const category=typeof product?.category==='string'?product.category:product?.category?.name??product?.category?.title??'';
 const metadata=[...(Array.isArray(product?.metadata?.tech_specs)?product.metadata.tech_specs:[]),...(Array.isArray(product?.metadata?.top_features)?product.metadata.top_features:[])].filter(value=>typeof value==='string');
 const text=[product?.title,plain(product?.description),plain(variant?.description),category,...metadata].join(' ');const evidence=expanded(text);const matches=[];
 for(const [index,query]of queries.entries()){const requested=words(query);if(requested.length&&requested.every(word=>[...expanded(word)].some(alias=>evidence.has(alias))))matches.push(index);}
 return matches;
}
export function balanceInterestCandidates(items,queries,{productOf=item=>item.product??item,variantOf=(item,product)=>item.variant??product?.variants?.[0],limit=items.length}={}){
 if(queries.length<2)return items.slice(0,limit);const pending=items.map((item,index)=>{const product=productOf(item);return {item,index,matches:interestMatches(product,variantOf(item,product),queries)};});const counts=new Map();const out=[];
 while(pending.length&&out.length<limit){pending.sort((a,b)=>{const score=x=>x.matches.length?Math.min(...x.matches.map(id=>counts.get(id)??0)):Infinity;return score(a)-score(b)||a.index-b.index;});const next=pending.shift();out.push(next.item);for(const id of next.matches)counts.set(id,(counts.get(id)??0)+1);}
 return out;
}
