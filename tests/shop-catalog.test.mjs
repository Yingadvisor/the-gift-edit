import test from 'node:test';
import assert from 'node:assert/strict';
import {rankShopProducts,productCategory,validateShopProfile,productImage,formatMoney,safeHttpsUrl,selectedMatches,shopBrief} from '../src/shop-catalog.mjs';
const profile={recipient:'Alex',likes:'They love ocean walks and hosting friends.',dislikes:'silk',query:'ocean home gifts',budget:75};
const product=(changes={})=>({id:'gid://shopify/p/fixture-ocean',title:'Ocean shell ceramic mug',description:'A ceramic mug with an ocean shell pattern.',media:[{type:'image',url:'https://cdn.example.com/mug.png',alt:'Synthetic test image'}],options:[{name:'Color',values:[{label:'Blue'}]}],selected:[{name:'Color',label:'Blue'}],variants:[{id:'gid://shopify/ProductVariant/fixture-1',options:[{name:'Color',label:'Blue'}],price:{amount:2400,currency:'USD'},availability:{available:true},url:'https://merchant.example.com/products/mug?variant=fixture-1&utm_source=shop',seller:{name:'Synthetic merchant',domain:'synthetic.myshopify.com'}}],...changes});
test('Shop profile requires a query and bounded budget',()=>{assert.equal(validateShopProfile(profile).valid,true);assert.equal(validateShopProfile({...profile,query:''}).valid,false);assert.equal(validateShopProfile({...profile,budget:0}).valid,false);});
test('actual prices are minor units and show explicit currency',()=>{assert.equal(formatMoney({amount:2400,currency:'USD'}),'$24.00 USD');assert.equal(formatMoney({amount:2000,currency:'JPY'}),'¥2,000 JPY');assert.equal(formatMoney({amount:2.5,currency:'USD'}),'Price unavailable');});
test('source image URLs and product attribution URLs remain unchanged',()=>{const p=product();const result=rankShopProducts([p],profile);assert.equal(result.recommendations[0].url,p.variants[0].url);assert.equal(productImage(p,p.variants[0]).url,p.media[0].url);});
test('reject unavailable, missing/mismatched currency and over-budget variants',()=>{for(const change of [{availability:{available:false}},{availability:{}},{price:{amount:2400,currency:'CAD'}},{price:{amount:7501,currency:'USD'}},{price:{amount:NaN,currency:'USD'}}]){const p=product();p.variants[0]={...p.variants[0],...change};assert.equal(rankShopProducts([p],profile).recommendations.length,0);}});
test('dislikes, item exclusions and category feedback remove matches',()=>{const p=product();assert.equal(rankShopProducts([p],{...profile,dislikes:'shells'}).recommendations.length,0);assert.equal(rankShopProducts([p],profile,{excludedIds:[p.id]}).recommendations.length,0);assert.equal(rankShopProducts([p],profile,{excludedCategories:['title:mugs']}).recommendations.length,0);});
test('unknown or giver-only interests do not become fabricated matches',()=>{assert.equal(rankShopProducts([product()],{...profile,likes:'I love ocean.'}).recommendations.length,0);assert.equal(rankShopProducts([product()],{...profile,likes:'They love chess.'}).recommendations.length,0);});
test('variants silently relaxed by provider cannot be treated as exact',()=>{const p=product();assert.equal(selectedMatches([{name:'Color',label:'Blue'}],p,p.variants[0]),true);assert.equal(selectedMatches([{name:'Color',label:'Red'}],p,p.variants[0]),false);});
test('unsafe URLs and missing images fail closed',()=>{for(const u of ['javascript:alert(1)','http://example.com','https://user:secret@example.com','https://127.0.0.1/x','not a url'])assert.equal(safeHttpsUrl(u),null);assert.equal(productImage({media:[{type:'video',url:'https://example.com/x'}]},{}),null);});
test('brief keeps personal details local and contains only the active merchant flow',()=>{const rec=rankShopProducts([product()],profile).recommendations[0];const b=shopBrief(profile,rec);assert.match(b,/Recipient: Alex/);assert.match(b,/pays on the merchant page/);assert.doesNotMatch(b,/expressionatelier\.vercel\.app/);assert.match(b,/not an LLM/);});
test('live description.plain shape is used for exclusions and treated as inert text',()=>{const p=product({description:{plain:'<p>This ocean mug comes with silk fabric.</p>'}});assert.equal(rankShopProducts([p],profile).recommendations.length,0);});
test('rationales cite supplied recipient words, not every synonym expansion',()=>{const p=product();const r=rankShopProducts([p],{...profile,likes:'They love ocean.'});assert.deepEqual(r.recommendations[0].evidence,['ocean']);});

test('main gift ranking removes greeting cards for birthdays without removing actual card gifts',()=>{
 const make=(title,n)=>product({id:`gid://shopify/Product/${n}`,title,description:'Ocean gift'});
 const result=rankShopProducts([make('Ocean greeting card',1),make('Ocean cardigan',2),make('Ocean card game',3),make('Ocean wallet card holder',4),make('Ocean gift wrapping paper',5)],{...profile,budget:100,occasion:'Birthday'});
 assert.deepEqual(result.recommendations.map(r=>r.product.title),['Ocean cardigan','Ocean card game','Ocean wallet card holder']);
 assert.ok(result.recommendations.every(r=>r.giftRole==='primary'));assert.equal(result.addons.length,2);assert.ok(result.addons.every(r=>r.giftRole==='addon'));assert.equal(result.rejected.length,0);
});
test('main gift ranking honors explicit card searches and recipient interests, not occasion alone',()=>{
 const p=product({title:'Ocean greeting card'});
 assert.equal(rankShopProducts([p],{...profile,query:'Ocean greeting cards'}).recommendations.length,1);
 assert.equal(rankShopProducts([p],{...profile,likes:'They collect greeting cards'}).recommendations.length,1);
 assert.equal(rankShopProducts([p],{...profile,occasion:'Birthday'}).recommendations.length,0);
});
test('catalog returns up to ten distinct real primary gifts and never pads results',()=>{
 const products=Array.from({length:15},(_,n)=>product({id:`gid://shopify/Product/${n}`,title:`Ocean mug ${n}`}));
 assert.equal(rankShopProducts(products,profile).recommendations.length,5);
 assert.equal(rankShopProducts([products[0],products[0],products[1]],profile).recommendations.length,2);
 assert.equal(rankShopProducts([],profile).recommendations.length,0);
});
test('soft value and category variety ordering preserve useful low-cost gifts',()=>{
 const make=(title,n,price)=>{const p=product({id:`gid://shopify/Product/${n}`,title,description:'Ocean gift'});p.variants[0].price.amount=price;return p;};
 const result=rankShopProducts([make('Ocean mug',1,400),make('Ocean mug',2,5000),make('Ocean mug',3,5000),make('Ocean towel',4,5000)],{...profile,budget:100});
 assert.equal(result.recommendations[0].product.id,'gid://shopify/Product/2');
 assert.equal(result.recommendations[1].product.title,'Ocean towel');
 assert.ok(result.recommendations.some(r=>r.variant.price.amount===400));
 assert.equal(result.recommendations.length,4);
});
test('gift set helpers are re-exported for the UI catalog entrypoint',async()=>{
 const catalog=await import('../src/shop-catalog.mjs');const set=await import('../src/gift-set.mjs');
 for(const name of ['summarizeGiftSet','canAddToGiftSet','setItemKey'])assert.equal(catalog[name],set[name]);
});


test('explicit birthday card query remains eligible without invented interest overlap',()=>{const p=product({title:'Birthday greeting card',description:'A birthday card'});const r=rankShopProducts([p],{...profile,likes:'They like coffee.',query:'birthday greeting cards'});assert.equal(r.recommendations.length,1);assert.match(r.recommendations[0].reasons[0],/explicit search request/);});
test('required Star Wars theme and male catalog evidence beat unrelated jewelry padding',()=>{const make=(title,n)=>product({id:`gid://shopify/Product/theme${n}`,title,description:title});const r=rankShopProducts([make("Women's Star Wars necklace",1),make("Men's Star Wars necklace",2),make("Men's plain necklace",3)],{...profile,likes:'They like coffee.',query:'Star Wars gifts for men',budget:100,audience:'men',ageBand:'30-44'});assert.deepEqual(r.recommendations.map(x=>x.product.title),["Men's Star Wars necklace"]);});
test('optional cards cannot evade theme, budget or explicit exclusions',()=>{const p=product({title:'Ocean greeting card'});assert.equal(rankShopProducts([p],{...profile,query:'Star Wars gifts'}).addons.length,0);assert.equal(rankShopProducts([p],{...profile,budget:1}).addons.length,0);assert.equal(rankShopProducts([p],profile,{excludedIds:[p.id]}).addons.length,0);});


test('broad categories preserve legacy exclusion IDs and share caps across titles and merchant IDs',()=>{
 assert.equal(productCategory({title:'Ocean mug'}).id,'title:mugs');
 assert.equal(productCategory({title:'Ocean mug'}).groupId,'drinkware');
 assert.equal(productCategory({title:'Ocean T-shirt',category:{id:'vendor-shirts',name:'Apparel'}}).id,'vendor-shirts');
 for(const title of ['T-shirt','Hoodie','Sweater','Cap'])assert.equal(productCategory({title}).groupId,'clothing');
 assert.equal(productCategory({title:'Unknown object'}).groupId,'other');
 assert.equal(productCategory({title:'Ocean card game'}).groupId,'toys-games');
 const items=Array.from({length:20},(_,i)=>product({id:`category-${i}`,title:`Ocean ${i%2?'hoodie':'T-shirt'}`,category:{id:`vendor-${i}`,name:'Apparel'}}));
 assert.equal(rankShopProducts(items,profile,{limit:40}).recommendations.length,5);
});

test('diverse real fixtures can fill ten slots but unknown products are capped at five without padding',()=>{
 const types=['T-shirt','mug','necklace','notebook','figurine','board game','pillow','mystery object'];
 const items=types.flatMap((type,index)=>Array.from({length:7},(_,n)=>product({id:`diverse-${index}-${n}`,title:`Ocean ${type}`,description:'Ocean design'})));
 const first=rankShopProducts(items,profile);
 assert.equal(first.recommendations.length,10);
 const all=rankShopProducts(items,profile,{limit:100});
 assert.equal(all.recommendations.length,40);
 const counts={};for(const rec of all.recommendations)counts[rec.category.groupId]=(counts[rec.category.groupId]??0)+1;
 assert.ok(Object.values(counts).every(count=>count<=5));
 assert.equal(new Set(all.recommendations.map(rec=>rec.product.id)).size,40);
 const unknown=items.filter(item=>item.title.includes('mystery'));
 assert.equal(rankShopProducts(unknown,profile,{limit:40}).recommendations.length,5);
 assert.equal(rankShopProducts(unknown.slice(0,2),profile,{limit:40}).recommendations.length,2);
});

test('seeded category usage caps additional pages without mutating input',()=>{
 const usage=Object.freeze({clothing:4,drinkware:5,other:5});
 const items=Array.from({length:8},(_,i)=>product({id:`seed-${i}`,title:`Ocean ${i<5?'T-shirt':'mug'}`}));
 const original=JSON.stringify(items);
 const result=rankShopProducts(items,profile,{limit:40,categoryUsage:usage});
 assert.equal(result.recommendations.length,1);
 assert.equal(result.recommendations[0].category.groupId,'clothing');
 assert.equal(JSON.stringify(items),original);
 assert.deepEqual(usage,{clothing:4,drinkware:5,other:5});
});

test('optional add-ons are bounded to five and respect shared seeded category usage',()=>{
 const items=Array.from({length:9},(_,i)=>product({id:`addon-${i}`,title:'Ocean greeting card'}));
 assert.equal(rankShopProducts(items,profile).addons.length,5);
 assert.equal(rankShopProducts(items,profile,{categoryUsage:{'stationery-books':4}}).addons.length,1);
});

test('independent-interest ranking reserves evidence-backed coverage while retaining category cap and hard constraints',()=>{
 const make=(id,title,amount=2000)=>{const p=product({id,title,description:title});p.variants[0].id=`variant-${id}`;p.variants[0].price.amount=amount;return p;};const entries=[...Array.from({length:10},(_,i)=>make(`h${i}`,'Hiking ceramic mug')),make('m','Movie cinema ceramic mug')];
 const context={...profile,likes:'hiking movie',query:'hiking gifts',budget:100};const result=rankShopProducts(entries,context);assert.equal(result.recommendations.length,5);assert.ok(result.recommendations.some(r=>r.product.id==='m'));assert.ok(result.recommendations.some(r=>r.product.id.startsWith('h')));
 const excluded=rankShopProducts([...entries,make('bad',"Women's movie necklace"),make('over','Movie book',10001)],{...context,audience:'men',dislikes:'cinema'});assert.ok(excluded.recommendations.every(r=>r.product.id!=='m'&&r.product.id!=='bad'&&r.product.id!=='over'));assert.ok(!excluded.recommendations.some(r=>r.product.title.includes('Movie')));
});
