import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recommend,validateProfile,ENGINE} from '../src/recommender.mjs';
import {CATALOG,CATALOG_INFO} from '../src/catalog.mjs';
import {buildBrief} from '../src/brief.mjs';
import {PROVIDER_CONTRACT} from '../src/provider-contract.mjs';
const profile={recipient:'Alex',relationship:'Friend',occasion:'Thank you',budget:119,likes:'They love ocean walks, shells and hosting friends.',dislikes:'Silk and pillows'};
test('original sample catalog has eight unique prototypes, five categories and four artworks',()=>{
  assert.equal(CATALOG.length,8);assert.equal(new Set(CATALOG.map(p=>p.id)).size,8);assert.equal(new Set(CATALOG.map(p=>p.category)).size,5);assert.equal(new Set(CATALOG.map(p=>p.artwork)).size,4);assert.ok(CATALOG.every(p=>p.original&&!p.liveListing));assert.equal(CATALOG_INFO.currency,null);
});
test('recipient interest evidence ranks ocean napkins first',()=>{const r=recommend(profile);assert.equal(r.status,'matched');assert.equal(r.recommendations[0].product.id,'ocean-napkins');assert.ok(r.recommendations[0].reasons.some(r=>r.quote==='ocean'));});
test('never recommends candidate retail above budget, even when supplier cost fits',()=>{for(const budget of [1,34.02,62.14,88.99,89,118.99,119,158.99,159]){const r=recommend({...profile,budget,dislikes:'',likes:'They love ocean, astronomy, gardening, travel, home decor and fashion.'},{limit:8});assert.ok(r.recommendations.every(rec=>rec.product.candidatePrice<=budget));if(budget<89){assert.equal(r.status,'no-match');assert.match(r.emptyReason,/starts at 89/);}}});
test('explicit budget equal to price is allowed',()=>assert.ok(recommend({...profile,budget:89}).recommendations.some(r=>r.product.id==='ocean-napkins')));
test('materials and product category dislikes are hard exclusions',()=>{const r=recommend({...profile,budget:200,likes:'They love space, fashion, ocean, home decor, plants, and hosting.'},{limit:8});assert.ok(r.recommendations.every(rec=>!rec.product.materials.includes('silk')&&rec.product.category!=='pillow'));});
test('explicit item rejection reranks without returning rejected item',()=>{const r=recommend(profile,{excludedIds:['ocean-napkins']});assert.ok(r.recommendations.every(rec=>rec.product.id!=='ocean-napkins'));assert.ok(r.rejected.some(x=>x.id==='ocean-napkins'&&x.kind==='excluded'));});
test('category feedback excludes every pillow variant',()=>{const r=recommend({...profile,dislikes:'',likes:'They love ocean, plants, travel, space, and home decor.',budget:200},{excludedCategories:['pillow'],limit:8});assert.ok(r.recommendations.every(rec=>rec.product.category!=='pillow'));});
test('explicit dislike wins over matching positive evidence',()=>{const r=recommend({...profile,likes:'They love ocean and shells.',dislikes:'ocean',budget:200});assert.equal(r.status,'no-match');});
test('unknown interests do not create an invented match',()=>{const r=recommend({...profile,likes:'They love chess and mathematics.',dislikes:'',budget:200});assert.equal(r.status,'no-match');});
test('giver first-person preference is not recipient evidence',()=>{const r=recommend({...profile,likes:'I love astronomy and space.',dislikes:'',budget:200});assert.equal(r.status,'no-match');assert.ok(r.notices.length);});
test('negative clauses in likes field become exclusions',()=>{const r=recommend({...profile,likes:'They love ocean. They do not like pillows.',dislikes:'',budget:200});assert.ok(r.recommendations.every(rec=>rec.product.category!=='pillow'));});
test('blank, nonfinite, zero, negative and oversized budget inputs are rejected',()=>{for(const budget of ['',NaN,Infinity,0,-1,10001])assert.equal(validateProfile({...profile,budget}).valid,false);});
test('missing recipient and blank or oversized likes are rejected',()=>{assert.equal(validateProfile({...profile,recipient:''}).valid,false);assert.equal(validateProfile({...profile,likes:''}).valid,false);assert.equal(validateProfile({...profile,likes:'a'.repeat(1201)}).valid,false);});
test('all-blue exclusion produces honest no match',()=>{const r=recommend({...profile,likes:'They love travel, space, and hosting.',dislikes:'blue',budget:200});assert.equal(r.status,'no-match');});
test('supplier costs remain distinct from candidate retails',()=>{assert.equal(CATALOG.find(p=>p.id==='celestial-square').candidatePrice,159);assert.equal(CATALOG.find(p=>p.id==='celestial-square').supplierSubtotal,104.95);assert.equal(CATALOG.find(p=>p.id==='ocean-napkins').candidatePrice,89);assert.equal(CATALOG.find(p=>p.id==='ocean-napkins').supplierSubtotal,34.02);});
test('brief contains recipient, avoidances, selected item and manual integration disclosure',()=>{const r=recommend(profile);const text=buildBrief(r.profile,r.recommendations[0],{excludedCategories:['pillow']});assert.match(text,/Recipient: Alex/);assert.match(text,/Silk and pillows/);assert.match(text,/Excluded categories: pillow/);assert.match(text,/currency unverified/);assert.match(text,/No parameter transfer/);assert.match(text,/https:\/\/expressionatelier.vercel.app\//);assert.doesNotMatch(text,/expressionatelier\.vercel\.app\/\?/);});
test('engine metadata never claims a connected model',()=>{assert.equal(ENGINE.modelConnected,false);assert.equal(PROVIDER_CONTRACT.connected,false);assert.match(ENGINE.disclosure,/No AI model is connected/);assert.equal(recommend(profile).engine.id,'rules-v1');});
test('browser code has only same-origin commerce API calls, no analytics/storage/HTML injection',async()=>{const js=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');assert.doesNotMatch(js,/XMLHttpRequest|sendBeacon|localStorage|sessionStorage|innerHTML|eval\s*\(/);});
test('UI discloses no model, live-price limits and buyer-controlled merchant handoff',async()=>{const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');assert.match(html,/Shop MCP \+ rules · No AI model connected/);assert.match(html,/Prices exclude shipping and tax/);assert.match(html,/This app never pays or places an order/);assert.match(html,/no automatic brief ingestion/);assert.match(html,/US \/ USD demo context/);});
test('stable repeated calls produce stable results',()=>assert.deepEqual(recommend(profile),recommend(profile)));
test('neither/nor/except statements are conservative exclusions',()=>{
  assert.equal(recommend({...profile,budget:200,dislikes:'',likes:'They like neither ocean nor gardening.'}).status,'no-match');
  assert.equal(recommend({...profile,budget:200,dislikes:'',likes:'They love ocean, except shells.'}).status,'no-match');
});
test('a single travel keyword is not claimed as multiple evidence signals',()=>{
  const r=recommend({...profile,budget:200,dislikes:'',likes:'They love travel.'});
  assert.ok(r.recommendations.every(rec=>rec.fitLabel==='One preference signal'));
});
