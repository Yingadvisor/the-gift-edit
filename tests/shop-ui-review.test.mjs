import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import * as shop from '../src/shop-catalog.mjs';
import {reviewContent} from '../src/product-review.mjs';

// All network responses are deterministic mocks. No Shop or merchant is called.
const profile={recipient:'Private Name',relationship:'Friend',occasion:'Birthday',likes:'They love ocean.',dislikes:'silk',query:'ocean mug',budget:75};
const selected=label=>[{name:'Color',label}];
function product(label='Red',description='Cotton ocean gift') {
  return {id:'gid://shopify/p/review',title:'Ocean gift',description,selected:selected(label),options:[{name:'Color',values:[{label:'Red',available:true,exists:true},{label:'Blue',available:true,exists:true}]}],variants:[{id:`gid://shopify/ProductVariant/${label}`,options:selected(label),price:{amount:2400,currency:'USD'},availability:{available:true},seller:{name:'Fixture merchant',domain:'fixture.myshopify.com'},url:'https://fixture.myshopify.com/products/ocean'}]};
}
const response=body=>({ok:true,json:async()=>body});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.hidden=false;this.isConnected=true;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  addEventListener(type,handler){this.listeners[type]=handler;}
  setAttribute(name,value){this[name]=value;}
  removeAttribute(name){delete this[name];}
  querySelector(){return this.submitButton??=new Element('button');}
  focus(){}
  scrollIntoView(){}
  showModal(){this.open=true;}
  close(){this.open=false;this.listeners.close?.();}
}
const descendants=node=>[node,...node.children.flatMap(descendants)];
async function harness(responder){
  const roots=new Map();const calls=[];const requests=[];
  const get=id=>{
    for(const root of roots.values()){const found=descendants(root).find(n=>n.id===id);if(found)return found;}
    if(!roots.has(id)){const node=new Element(id);node.id=id;roots.set(id,node);}
    return roots.get(id);
  };
  get('gift-form').values={...profile};
  get('relationship').value=profile.relationship;
  get('recipient').value=profile.recipient;
  const context=vm.createContext({...shop,reviewContent,URL,crypto:webcrypto,TextEncoder,Uint8Array,structuredClone,
    document:{getElementById:get,createElement:tag=>new Element(tag)},
    window:{innerWidth:1000},navigator:{},
    FormData:class{constructor(form){return Object.entries(form.values);}},
    fetch:async(url,options)=>{const payload=JSON.parse(options.body);calls.push(payload);requests.push({url,payload});return responder(payload,calls.length);},
  });
  const app=(await readFile(new URL('../public/app.mjs',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
  vm.runInContext(app,context);
  const run=source=>vm.runInContext(source,context);
  context.fixtureProfile={...profile};context.fixtureProduct=product();
  run('state.profile=fixtureProfile;state.active={rec:{product:fixtureProduct,variant:fixtureProduct.variants[0]},product:null,variant:null,selected:fixtureProduct.selected,requested:fixtureProduct.selected,profile:{...fixtureProfile},valid:false};');
  return {get,run,calls,requests,context};
}

test('Shop UI review: pending checkout A cannot appear beneath refreshed variant B',async()=>{
  const pending=deferred();
  const h=await harness(payload=>payload.action==='checkout'?pending.promise:response({product:product(payload.selected[0].label),messages:[]}));
  await h.run('refreshProduct(state.active.selected)');
  const checkout=h.run('createCheckout()');
  await h.run('refreshProduct([{name:"Color",label:"Blue"}])');
  pending.resolve(response({checkout:{status:'incomplete',currency:'USD',line_items:[{item:{id:'gid://shopify/ProductVariant/Red',title:'Ocean gift'},quantity:1}],totals:[],links:[],messages:[],continue_url:'https://fixture.myshopify.com/checkout/red'},messages:[]}));
  await checkout;
  assert.equal(h.run('state.active.variant.id'),'gid://shopify/ProductVariant/Blue');
  assert.ok(!descendants(h.get('checkout-result')).some(n=>n.href==='https://fixture.myshopify.com/checkout/red'));
});

test('Shop UI review: exact refreshed variant must still honor local silk exclusion',async()=>{
  const h=await harness(()=>response({product:product('Red','Silk ocean gift'),messages:[]}));
  await h.run('refreshProduct(state.active.selected)');
  assert.equal(h.run('state.active.valid'),false);
  assert.equal(h.get('create-checkout').disabled,true);
});

test('Shop UI review: stale product refresh response cannot replace newer selection',async()=>{
  const first=deferred();
  const h=await harness(payload=>payload.selected[0].label==='Red'?first.promise:response({product:product('Blue'),messages:[]}));
  const red=h.run('refreshProduct(state.active.selected)');
  await h.run('refreshProduct([{name:"Color",label:"Blue"}])');
  first.resolve(response({product:product('Red'),messages:[]}));await red;
  assert.equal(h.run('state.active.variant.id'),'gid://shopify/ProductVariant/Blue');
});

test('Shop UI review: search sends query and budget, never recipient private profile',async()=>{
  const h=await harness(()=>response({products:[],messages:[]}));
  await h.run('search()');
  assert.deepEqual(h.calls,[{action:'search',query:'ocean mug',budget:75}]);
  assert.doesNotMatch(JSON.stringify(h.calls),/Private Name|Birthday|silk|They love/);
});

test('Shop UI review: uncertain checkout cannot be repeated or offered a safe refresh retry',async()=>{
  const h=await harness(payload=>payload.action==='checkout'?{ok:false,json:async()=>({error:{code:'CHECKOUT_ITEMS_CHANGED',message:'Changed items',reviewRequired:true,outcomeUncertain:true}})}:response({product:product(),messages:[]}));
  await h.run('refreshProduct(state.active.selected)');
  await h.run('createCheckout()');await h.run('createCheckout()');
  assert.equal(h.calls.filter(c=>c.action==='checkout').length,1);
  assert.ok(!descendants(h.get('checkout-result')).some(n=>n.textContent==='Refresh and review changes'));
});

test('Shop UI review: pre-checkout refresh warnings survive combined checkout envelope',async()=>{
  const warning={type:'warning',content:'Material changed; review merchant details.'};
  const h=await harness(payload=>payload.action==='checkout'?response({checkout:{status:'incomplete',currency:'USD',line_items:[],totals:[],links:[],messages:[],continue_url:'https://fixture.myshopify.com/checkout/red'},messages:[warning]}):response({product:product(),messages:[]}));
  await h.run('refreshProduct(state.active.selected)');await h.run('createCheckout()');
  assert.ok(descendants(h.get('checkout-result')).some(n=>n.textContent===warning.content));
});

test('Agent UI review: initialization and checking AI consent alone make no network calls',async()=>{
  const h=await harness(()=>{throw new Error('Unexpected request');});
  h.get('use-agent').checked=true;
  assert.equal(h.calls.length,0);
});

test('Agent UI review: explicit AI search sends only consented preference fields, not identity fields',async()=>{
  const h=await harness(()=>response({modelConnected:true,model:'openai/gpt-4.1-mini',products:[],recommendations:[],messages:[],toolTrace:[]}));
  h.get('use-agent').checked=true;
  h.run("state.excludedFactors=['fragrance']");
  await h.run('search()');
  assert.deepEqual(h.requests,[{url:'/api/agent',payload:{consent:true,likes:profile.likes,dislikes:profile.dislikes,occasion:profile.occasion,budget:profile.budget,query:profile.query,excludedFactors:['fragrance']}}]);
  assert.doesNotMatch(JSON.stringify(h.calls),/Private Name|Friend|recipient|relationship/);
});

test('Agent UI review: failed AI search never silently calls rules or claims model connection',async()=>{
  const h=await harness(()=>({ok:false,json:async()=>({error:{code:'MODEL_NOT_CONFIGURED',message:'Model not configured'}})}));
  h.get('use-agent').checked=true;
  await h.run('search()');
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/agent');
  assert.equal(h.run('state.agentResult'),null);
  assert.match(h.get('engine-badge').textContent,/No AI model connected/);
});

test('Agent UI review: exact recommended second variant remains visible and selected',async()=>{
  const p=product();const blue=product('Blue').variants[0];p.variants.push(blue);p.selected=selected('Blue');
  const h=await harness(()=>response({modelConnected:true,model:'openai/gpt-4.1-mini',products:[p],recommendations:[{productId:p.id,variantId:blue.id,reason:'Verified blue ocean gift.'}],messages:[],toolTrace:[]}));
  h.get('use-agent').checked=true;
  await h.run('search()');
  assert.equal(h.run('state.result.recommendations.length'),1);
  assert.equal(h.run('state.result.recommendations[0].variant.id'),blue.id);
});

test('Exclusion UI review: chips rerank locally and clear without clearing typed dislikes',async()=>{
  const h=await harness(()=>{throw new Error('Chip controls must not call network');});
  h.context.fixtureProducts=[product('Red','Scented cotton ocean gift'),{...product('Blue','Silk ocean gift'),id:'gid://shopify/p/silk'}];
  h.run('state.products=fixtureProducts;render()');
  assert.equal(h.run('state.result.recommendations.length'),1);
  h.get('exclusion-chips').children.find(n=>n['aria-label']==='Fragranced items').listeners.click();
  assert.equal(h.run('state.result.recommendations.length'),0);
  h.get('reset-factors').listeners.click();
  assert.equal(h.run('state.result.recommendations.length'),1);
  assert.equal(h.run('state.profile.dislikes'),'silk');
  assert.equal(h.get('gift-form').values.dislikes,'silk');
  assert.equal(h.calls.length,0);
});

test('Exclusion UI review: refreshed selected-factor conflict blocks checkout',async()=>{
  const h=await harness(()=>response({product:product('Red','Scented cotton ocean gift'),messages:[]}));
  h.run("state.excludedFactors=['fragrance']");
  await h.run('refreshProduct(state.active.selected)');
  assert.equal(h.run('state.active.valid'),false);
  assert.equal(h.get('create-checkout').disabled,true);
});

test('Exclusion review: public review hash includes variant metadata and product option changes',()=>{
  const p=product();const v=p.variants[0];
  assert.notEqual(reviewContent(p,v),reviewContent(p,{...v,metadata:{fragrance:'Scented'}}));
  assert.notEqual(reviewContent(p,v),reviewContent({...p,options:[...p.options,{name:'Size',values:[{label:'S'},{label:'M'}]}]},v));
});

test('Exclusion review: unrelated one-size accessory cannot cancel actual apparel size choices',()=>{
  const p={title:'Ocean hoodie',description:'Includes a one-size scarf.',options:[{name:'Size',values:[{label:'S'},{label:'M'}]}]};
  const v={options:[{name:'Size',label:'M'}]};
  assert.equal(shop.assessExclusions(p,v,['sizing']).matches.length,1);
});

function setProduct(label,amount=2400,merchant='fixture.myshopify.com',description='Cotton ocean gift'){
  const p=product(label,description);p.id=`gid://shopify/p/set-${label}`;p.title=`Ocean gift ${label}`;
  p.variants[0].price.amount=amount;p.variants[0].seller={name:merchant,domain:merchant};return p;
}
async function addFixture(h,p){
  h.context.nextFixture=p;
  h.run('state.active={rec:{product:nextFixture,variant:nextFixture.variants[0]},product:nextFixture,variant:nextFixture.variants[0],selected:nextFixture.selected??[],requested:nextFixture.selected??[],profile:{...state.profile},modelGuided:false,valid:true};');
  await h.run('addActiveToSet()');
}
function budget(h,value){h.get('budget').value=String(value);h.run(`state.profile.budget=${value}`);}
const checkoutResponse=(url='https://fixture.myshopify.com/checkout/test')=>response({checkout:{status:'incomplete',currency:'USD',line_items:[],totals:[],links:[],messages:[],continue_url:url},messages:[]});

test('Gift set UI review: add/remove exact variants uses cents and never creates checkout',async()=>{
  const h=await harness(()=>{throw new Error('Adding gifts is local');});budget(h,100);
  await addFixture(h,setProduct('A',2911));await addFixture(h,setProduct('B',4099));
  assert.equal(h.run('setSummary().subtotal'),7010);assert.equal(h.run('setSummary().remaining'),2990);assert.equal(h.calls.length,0);
  await addFixture(h,setProduct('A',2911));assert.equal(h.run('state.setItems.length'),2);
  descendants(h.get('gift-set-content')).find(n=>n.textContent==='Remove').listeners.click();
  assert.equal(h.run('state.setItems.length'),1);assert.equal(h.run('setSummary().subtotal'),4099);assert.equal(h.calls.length,0);
});

test('Gift set UI review: total above $100 blocks add and lowering budget retains but disables set',async()=>{
  const h=await harness(()=>{throw new Error('Over-budget set cannot dispatch');});budget(h,100);
  await addFixture(h,setProduct('A',6000));await addFixture(h,setProduct('B',5000));
  assert.equal(h.run('state.setItems.length'),1);assert.equal(h.run('setSummary().subtotal'),6000);
  h.get('budget').value='50';h.get('budget').listeners.input();
  assert.equal(h.run('state.setItems.length'),1);assert.equal(h.run('setSummary().overBudget'),true);assert.equal(h.run('setSummary().valid'),false);
  await h.run("createSetCheckout('fixture.myshopify.com')");assert.equal(h.calls.length,0);
});

test('Gift set UI review: changed exclusion chips block set without removing selected gifts',async()=>{
  const h=await harness(()=>{throw new Error('Excluded set cannot dispatch');});budget(h,100);
  await addFixture(h,setProduct('A',3000,undefined,'Scented cotton ocean gift'));
  h.get('exclusion-chips').children.find(n=>n['aria-label']==='Fragranced items').listeners.click();
  assert.equal(h.run('state.setItems.length'),1);assert.equal(h.run('setSummary().valid'),false);
  await h.run("createSetCheckout('fixture.myshopify.com')");assert.equal(h.calls.length,0);
});

test('Gift set UI review: changed typed preferences block single-item and set checkout',async()=>{
  const h=await harness(()=>{throw new Error('Dirty preferences cannot dispatch');});budget(h,100);
  await addFixture(h,setProduct('A',3000));
  h.get('gift-form').listeners.input({target:{id:'dislikes'}});
  await h.run('createCheckout()');await h.run("createSetCheckout('fixture.myshopify.com')");
  assert.equal(h.run('state.preferencesDirty'),true);assert.equal(h.calls.length,0);
});

test('Gift set UI review: reduced budget cannot bypass guard through direct single-item checkout',async()=>{
  const h=await harness(()=>{throw new Error('Over-budget single item cannot dispatch');});budget(h,100);
  await addFixture(h,setProduct('A',6000));
  h.get('budget').value='50';h.get('budget').listeners.input();await h.run('createCheckout()');assert.equal(h.calls.length,0);
});

test('Gift set UI review: mixed merchants display and create separate exact group payloads',async()=>{
  const h=await harness(()=>checkoutResponse());budget(h,100);
  await addFixture(h,setProduct('A',3000,'one.myshopify.com'));await addFixture(h,setProduct('B',4000,'two.myshopify.com'));
  assert.equal(h.run('setSummary().groups.length'),2);
  assert.ok(descendants(h.get('gift-set-content')).some(n=>/separate checkouts and deliveries/.test(n.textContent)));
  await h.run("createSetCheckout('one.myshopify.com')");await h.run("createSetCheckout('two.myshopify.com')");
  assert.equal(h.calls.length,2);
  for(const [i,shop] of ['one.myshopify.com','two.myshopify.com'].entries()){
    const request=h.calls[i];assert.equal(request.action,'checkout_set');assert.equal(request.items.length,1);assert.equal(request.items[0].shop,shop);assert.equal(request.confirmed,true);assert.equal(request.budget,100);
    assert.match(request.items[0].expectedDetailsHash,/^[a-f0-9]{64}$/);assert.ok(!('quantity' in request.items[0]));
  }
});

test('Gift set UI review: uncertain AB attempt blocks overlapping A and direct single A',async()=>{
  const h=await harness(()=>({ok:false,json:async()=>({error:{code:'CHECKOUT_OUTCOME_UNCERTAIN',message:'Uncertain',outcomeUncertain:true}})}));budget(h,100);
  await addFixture(h,setProduct('A',3000));await addFixture(h,setProduct('B',4000));await h.run("createSetCheckout('fixture.myshopify.com')");
  h.run('state.setItems=state.setItems.slice(0,1);setChanged();');await h.run("createSetCheckout('fixture.myshopify.com')");
  h.run('state.active={...state.active,product:state.setItems[0].product,variant:state.setItems[0].variant,selected:state.setItems[0].selected,valid:true};');await h.run('createCheckout()');
  assert.equal(h.calls.length,1);
});

test('Gift set UI review: stale set refresh cannot resurrect a removed gift',async()=>{
  const pending=deferred();const h=await harness(()=>pending.promise);budget(h,100);const p=setProduct('A',3000);
  await addFixture(h,p);const refresh=h.run('refreshGiftSet()');h.run('state.setItems=[];setChanged();');
  pending.resolve(response({product:p,messages:[]}));await refresh;
  assert.equal(h.run('state.setItems.length'),0);assert.equal(h.run('state.setBusy'),false);
});

test('Gift set UI review: delayed merchant A response cannot overwrite open merchant B modal',async()=>{
  const a=deferred(),b=deferred();const h=await harness(payload=>payload.items[0].shop==='one.myshopify.com'?a.promise:b.promise);budget(h,100);
  await addFixture(h,setProduct('A',3000,'one.myshopify.com'));await addFixture(h,setProduct('B',4000,'two.myshopify.com'));
  const first=h.run("createSetCheckout('one.myshopify.com')"),second=h.run("createSetCheckout('two.myshopify.com')");
  a.resolve(checkoutResponse('https://one.myshopify.com/checkout/a'));await first;
  assert.match(h.get('set-checkout-title').textContent,/two.myshopify.com/);
  assert.ok(!descendants(h.get('set-checkout-result')).some(n=>n.href==='https://one.myshopify.com/checkout/a'));
  b.resolve(checkoutResponse('https://two.myshopify.com/checkout/b'));await second;
  assert.ok(descendants(h.get('set-checkout-result')).some(n=>n.href==='https://two.myshopify.com/checkout/b'));
});

test('Gift set UI review: refreshed merchant warnings and unknown-factor notices stay visible',async()=>{
  const p=setProduct('A',3000);const warning={type:'warning',content:'Only ships after 30 days.'};
  const h=await harness(()=>response({product:p,messages:[warning]}));budget(h,100);h.run("state.excludedFactors=['fragrance']");
  await addFixture(h,p);await h.run('refreshGiftSet()');
  assert.ok(descendants(h.get('gift-set-content')).some(n=>n.textContent===warning.content));
  assert.ok(descendants(h.get('gift-set-content')).some(n=>/Can’t verify: Fragranced items/.test(n.textContent)));
});

test('Gift set UI review: truly optionless products can remain valid set entries after refresh',async()=>{
  const p=setProduct('A',3000);delete p.options;delete p.selected;delete p.variants[0].options;
  const h=await harness(()=>response({product:p,messages:[]}));budget(h,100);await addFixture(h,p);await h.run('refreshGiftSet()');
  assert.equal(h.run('state.setItems.length'),1);assert.equal(h.run('setSummary().valid'),true);
});

test('Gift set UI review: invalid search then new recipient cannot retain old AI review provenance',async()=>{
  const h=await harness(()=>response({products:[],messages:[]}));budget(h,100);
  await addFixture(h,setProduct('A',3000));h.run('state.setItems[0].modelGuided=true');
  h.get('gift-form').values={...profile,budget:0};h.get('budget').value='0';await h.run('search()');
  // Example buttons update form values and submit without individual input events.
  h.get('gift-form').values={...profile,recipient:'Different Recipient',likes:'They love chess.',budget:100};h.get('budget').value='100';await h.run('search()');
  assert.equal(h.run('state.setItems.length'),1);
  assert.equal(h.run('state.setItems[0].reviewed'),false);
  assert.equal(h.run('state.setItems[0].modelGuided'),false);
  assert.equal(h.run('setSummary().valid'),false);
});

test('Arrival UI review: strict date yields no eligible gifts despite stock or unsupported ETA fields',async()=>{
  const p=product();p.delivery={arrives_by:'2026-10-16',guaranteed:true};p.description='Ocean gift. In stock. Fast next-day shipping.';
  const h=await harness(()=>response({products:[p],messages:[]}));
  h.get('gift-form').values={...profile,mustArrive:'on',arrivalDeadline:'2026-10-20'};
  await h.run('search()');
  assert.equal(h.run('state.profile.arrivalDeadline'),'2026-10-20');assert.equal(h.run('state.result.recommendations.length'),0);
  assert.ok(descendants(h.get('results-content')).some(n=>/Can’t verify delivery by 2026-10-20/.test(n.textContent)));
  assert.deepEqual(h.calls,[{action:'search',query:profile.query,budget:profile.budget}]);
  assert.doesNotMatch(JSON.stringify(h.calls),/2026-10-20|arrival|destination|address|Private Name/);
});

test('Arrival UI review: AI payload also omits strict date and destination and filters returned picks locally',async()=>{
  const p=product();const h=await harness(()=>response({modelConnected:true,model:'openai/gpt-4.1-mini',products:[p],recommendations:[{productId:p.id,variantId:p.variants[0].id,reason:'Ocean gift'}],messages:[],toolTrace:[]}));
  h.get('use-agent').checked=true;h.get('gift-form').values={...profile,mustArrive:'on',arrivalDeadline:'2026-10-20'};
  await h.run('search()');
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/agent');assert.equal(h.run('state.result.recommendations.length'),0);
  assert.doesNotMatch(JSON.stringify(h.calls),/2026-10-20|mustArrive|arrivalDeadline|destination|address|Private Name|relationship/);
});

test('Arrival UI review: checkbox changes are local and immediately block existing set checkout',async()=>{
  const h=await harness(()=>{throw new Error('Changing arrival requirements must not dispatch');});budget(h,100);await addFixture(h,setProduct('A',3000));
  h.get('must-arrive').checked=true;h.get('must-arrive').listeners.change();
  assert.equal(h.get('arrival-deadline').disabled,false);assert.equal(h.run('state.preferencesDirty'),true);assert.equal(h.run('state.setItems[0].reviewed'),false);
  await h.run("createSetCheckout('fixture.myshopify.com')");await h.run('createCheckout()');assert.equal(h.calls.length,0);
  h.get('must-arrive').checked=false;h.get('must-arrive').listeners.change();
  assert.equal(h.get('arrival-deadline').disabled,true);assert.equal(h.calls.length,0);assert.equal(h.run('setSummary().valid'),false);
});

test('Arrival UI review: enabled deadline remains a hard set guard after search and refresh',async()=>{
  const p=setProduct('A',3000);const h=await harness(payload=>payload.action==='product'?response({product:p,messages:[]}):response({products:[p],messages:[]}));budget(h,100);await addFixture(h,p);
  h.get('must-arrive').checked=true;h.get('must-arrive').listeners.change();h.get('gift-form').values={...profile,budget:100,mustArrive:'on',arrivalDeadline:'2026-10-20'};
  await h.run('search()');await h.run('refreshGiftSet()');
  assert.equal(h.run('state.setItems.length'),1);assert.equal(h.run('setSummary().valid'),false);assert.equal(h.run('state.setItems[0].reviewed'),false);
  await h.run("createSetCheckout('fixture.myshopify.com')");assert.ok(h.calls.every(c=>c.action==='search'||c.action==='product'));
  assert.doesNotMatch(JSON.stringify(h.calls),/2026-10-20|arrivalDeadline|destination|address/);
});

test('Arrival UI review: turning strict date off restores set eligibility only after search and fresh review',async()=>{
  const p=setProduct('A',3000);const h=await harness(payload=>payload.action==='product'?response({product:p,messages:[]}):response({products:[p],messages:[]}));budget(h,100);await addFixture(h,p);
  h.get('must-arrive').checked=true;h.get('must-arrive').listeners.change();h.get('gift-form').values={...profile,budget:100,mustArrive:'on',arrivalDeadline:'2026-10-20'};await h.run('search()');
  h.get('must-arrive').checked=false;h.get('must-arrive').listeners.change();assert.equal(h.run('setSummary().valid'),false);
  h.get('gift-form').values={...profile,budget:100};await h.run('search()');assert.equal(h.run('state.profile.arrivalDeadline'),null);assert.equal(h.run('setSummary().valid'),false);
  await h.run('refreshGiftSet()');assert.equal(h.run('setSummary().valid'),true);
});

test('Arrival UI review: missing or impossible required date rejects search before network',async()=>{
  const h=await harness(()=>{throw new Error('Invalid date cannot dispatch');});
  for(const arrivalDeadline of ['', '2026-02-30']){
    h.get('gift-form').values={...profile,mustArrive:'on',arrivalDeadline};await h.run('search()');assert.equal(h.get('form-errors').hidden,false);
  }
  assert.equal(h.calls.length,0);
});

test('Self-gift UI review: Friend remains default with recipient-required labels',async()=>{
  const h=await harness(()=>{throw new Error('Initialization must stay local');});
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/<select id="relationship"[^>]*><option value="Friend">Friend<\/option>/);
  assert.equal(h.get('relationship').value,'Friend');assert.equal(h.get('recipient').disabled,false);assert.equal(h.get('recipient').required,true);
  assert.equal(h.get('recipient-label').textContent,'Who is the gift for?');assert.equal(h.get('likes-label').textContent,'What do they love?');assert.equal(h.calls.length,0);
});

test('Self-gift UI review: choosing Myself changes labels and disables name without sending data',async()=>{
  const h=await harness(()=>{throw new Error('Relationship changes must stay local');});
  h.get('relationship').value='Myself';h.get('relationship').listeners.change();
  assert.equal(h.get('recipient').value,'You');assert.equal(h.get('recipient').disabled,true);assert.equal(h.get('recipient').required,false);
  assert.equal(h.get('recipient-label').textContent,'This one is for you');assert.equal(h.get('likes-label').textContent,'What do you love?');
  assert.equal(h.get('profile-heading').textContent,'A few things about you');assert.equal(h.get('workspace-title').textContent,'What would you love?');
  assert.match(h.get('likes-note').textContent,/First-person/);assert.equal(h.calls.length,0);
});

test('Self-gift UI review: switching back restores recipient and invalidates previous gift approval',async()=>{
  const h=await harness(()=>{throw new Error('Relationship changes cannot create checkout');});budget(h,100);await addFixture(h,setProduct('A',3000));h.run('state.setItems[0].modelGuided=true');
  h.get('relationship').value='Myself';h.get('relationship').listeners.change();
  assert.equal(h.run('state.setItems[0].reviewed'),false);assert.equal(h.run('state.setItems[0].modelGuided'),false);
  h.get('relationship').value='Friend';h.get('relationship').listeners.change();
  assert.equal(h.get('recipient').value,'Private Name');assert.equal(h.get('recipient').disabled,false);assert.equal(h.get('recipient').required,true);
  assert.equal(h.get('likes-label').textContent,'What do they love?');assert.equal(h.run('state.preferencesDirty'),true);assert.equal(h.run('setSummary().valid'),false);
  await h.run("createSetCheckout('fixture.myshopify.com')");await h.run('createCheckout()');assert.equal(h.calls.length,0);
});

test('Self-gift UI review: self search accepts omitted disabled name and first-person interests',async()=>{
  const h=await harness(()=>response({products:[product()],messages:[]}));
  h.get('relationship').value='Myself';h.get('relationship').listeners.change();
  const {recipient,...selfForm}=profile;h.get('gift-form').values={...selfForm,relationship:'Myself',likes:'I love ocean.'};
  await h.run('search()');assert.equal(h.get('form-errors').hidden,true);assert.equal(h.run('state.profile.recipient'),'You');assert.equal(h.run('state.profile.selfGift'),true);
  assert.equal(h.run('state.result.recommendations.length'),1);assert.equal(h.get('results-title').textContent,'A thoughtful edit for you.');
  assert.deepEqual(h.calls,[{action:'search',query:profile.query,budget:profile.budget}]);
});

test('Self-gift UI review: AI sends only the selfGift flag, never name or relationship',async()=>{
  const h=await harness(()=>response({modelConnected:true,model:'openai/gpt-4.1-mini',products:[],recommendations:[],messages:[],toolTrace:[]}));
  h.get('relationship').value='Myself';h.get('relationship').listeners.change();h.get('use-agent').checked=true;
  h.get('gift-form').values={...profile,relationship:'Myself',recipient:'PRIVATE_UNUSED_IDENTITY',likes:'I love ocean.'};
  await h.run('search()');assert.equal(h.calls.length,1);assert.equal(h.requests[0].url,'/api/agent');assert.equal(h.calls[0].selfGift,true);
  assert.doesNotMatch(JSON.stringify(h.calls),/PRIVATE_UNUSED_IDENTITY|Private Name|recipient|relationship|Myself/);
  assert.equal(h.calls[0].likes,'I love ocean.');assert.equal(h.calls[0].consent,true);
});

test('Self-gift UI review: example button returns to Friend without restoring stale recipient text',async()=>{
  const h=await harness(()=>response({products:[],messages:[]}));h.get('relationship').value='Myself';h.get('relationship').listeners.change();
  const form=h.get('gift-form');form.elements={namedItem:key=>({get value(){return h.get(key).value;},set value(value){h.get(key).value=value;form.values[key]=value;}})};
  let submission;form.requestSubmit=()=>{submission=h.run('search()');};
  h.get('try-example').listeners.click();await submission;
  assert.equal(h.get('relationship').value,'Friend');assert.equal(h.get('recipient').value,'Alex');assert.equal(h.get('recipient').disabled,false);
  assert.equal(h.get('likes-label').textContent,'What do they love?');assert.equal(h.run('state.profile.recipient'),'Alex');assert.equal(h.run('state.profile.selfGift'),false);
  assert.equal(h.calls.length,1);assert.equal(h.requests[0].url,'/api/shop');
});
