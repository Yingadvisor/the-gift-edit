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
async function harness(responder,{realCustom=false}={}){
  const roots=new Map();const calls=[];const requests=[];const custom={refreshes:0,options:null};let doc;
  const get=id=>{
    for(const root of roots.values()){const found=descendants(root).find(n=>n.id===id);if(found)return found;}
    if(!roots.has(id)){const node=new Element(id);node.id=id;node.ownerDocument=doc;roots.set(id,node);}
    return roots.get(id);
  };
  doc={getElementById:get,createElement:tag=>{const node=new Element(tag);node.ownerDocument=doc;return node;}};
  const customSource=realCustom?(await readFile(new URL('../public/custom-panel.mjs',import.meta.url),'utf8')).replace("'/modules/custom-concepts.mjs'",JSON.stringify(new URL('../src/custom-concepts.mjs',import.meta.url).href)):null;
  const actualCustom=realCustom?(await import(`data:text/javascript;base64,${Buffer.from(customSource).toString('base64')}`)).initCustomPanel:null;
  get('gift-form').values={...profile};
  get('relationship').value=profile.relationship;
  get('recipient').value=profile.recipient;
  const context=vm.createContext({initCustomPanel:options=>{custom.options=options;return actualCustom?actualCustom(options):{refresh(){custom.refreshes++;}};},...shop,reviewContent,URL,crypto:webcrypto,TextEncoder,Uint8Array,structuredClone,
    document:doc,
    window:{innerWidth:1000},navigator:{},
    FormData:class{constructor(form){return Object.entries(form.values);}},
    fetch:async(url,options)=>{const payload=JSON.parse(options.body);calls.push(payload);requests.push({url,payload});return responder(payload,calls.length);},
  });
  const app=(await readFile(new URL('../public/app.mjs',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
  vm.runInContext(app,context);
  const run=source=>vm.runInContext(source,context);
  context.fixtureProfile={...profile};context.fixtureProduct=product();
  run('state.profile=fixtureProfile;state.active={rec:{product:fixtureProduct,variant:fixtureProduct.variants[0]},product:null,variant:null,selected:fixtureProduct.selected,requested:fixtureProduct.selected,profile:{...fixtureProfile},valid:false};');
  return {get,run,calls,requests,custom,context};
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
  assert.deepEqual(h.calls,[{action:'search',query:'ocean gifts',budget:75}]);
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
  assert.deepEqual(h.requests,[{url:'/api/agent',payload:{consent:true,likes:profile.likes,dislikes:profile.dislikes,occasion:profile.occasion,budget:profile.budget,query:'ocean gifts',expression:'',style:'any',lifestyle:'any',excludedFactors:['fragrance']}}]);
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
  assert.deepEqual(h.calls,[{action:'search',query:'ocean gifts',budget:profile.budget}]);
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
  assert.deepEqual(h.calls,[{action:'search',query:'ocean gifts',budget:profile.budget}]);
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
  assert.deepEqual(h.calls.map(call=>call.query),['ocean walks gifts','collecting shells gifts','hosting gifts']);assert.ok(h.requests.every(request=>request.url==='/api/shop'));
});



test('Ready-only UI review: a disabled custom-mode request retains ready-made results and set',async()=>{
  const h=await harness(()=>response({products:[product()],messages:[]}));await h.run('search()');await addFixture(h,setProduct('A',3000));
  const result=h.run('state.result'),products=h.run('state.products'),set=h.run('state.setItems');const callCount=h.calls.length;
  h.run("setGiftMode('custom');setGiftMode('ready')");
  assert.equal(h.get('ready-made-content').hidden,false);assert.equal(h.get('custom-workspace').hidden,true);
  assert.equal(h.run('state.result'),result);assert.equal(h.run('state.products'),products);assert.equal(h.run('state.setItems'),set);assert.equal(h.calls.length,callCount);
});

test('Audience UI review: AI receives only generic selected adult audience context, not identity',async()=>{
  const h=await harness(()=>response({modelConnected:true,model:'openai/gpt-4.1-mini',products:[],recommendations:[],messages:[],toolTrace:[]}));
  h.get('gift-form').values={...profile,audience:'men',ageBand:'30-44'};h.get('use-agent').checked=true;await h.run('search()');
  assert.equal(h.calls.length,1);assert.equal(h.requests[0].url,'/api/agent');assert.equal(h.calls[0].audience,'men');assert.equal(h.calls[0].ageBand,'30-44');
  assert.doesNotMatch(JSON.stringify(h.calls),/Private Name|recipient|relationship|birthDate|birthdayDate|address/);
});

test('Audience UI review: rules search inherits Men from stated interests and retains adult constraints locally',async()=>{
  const h=await harness(()=>response({products:[],messages:[]}));h.get('gift-form').values={...profile,likes:'They love ocean gifts for men.',ageBand:'45-64',audience:'any'};
  await h.run('search()');assert.equal(h.run('state.profile.audience'),'men');assert.equal(h.run('state.profile.ageBand'),'45-64');
  assert.match(h.calls[0].query,/men/i);assert.match(h.calls[0].query,/adult/);assert.deepEqual(Object.keys(h.calls[0]).sort(),['action','budget','query']);
  assert.ok(!('audience' in h.calls[0]));assert.ok(!('ageBand' in h.calls[0]));
});

test('Audience UI review: relationship choices place Myself before Other',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const relationship=html.match(/<select id="relationship"[\s\S]*?<\/select>/)[0];
  assert.ok(relationship.indexOf('<option>Myself</option>')<relationship.indexOf('<option>Other</option>'));
});

test('Add-ons UI review: cards stay separate, become addable only after refresh, and share set budget',async()=>{
  const card=product('Blue');card.id='gid://shopify/p/card';card.title='Ocean greeting card';card.variants[0].price.amount=400;
  const h=await harness(payload=>payload.action==='product'?response({product:card,messages:[]}):response({products:[product(),card],messages:[]}));budget(h,100);h.get('gift-form').values={...profile,budget:100};
  await h.run('search()');assert.equal(h.run('state.result.recommendations.length'),1);assert.equal(h.run('state.result.addons.length'),1);
  assert.ok(descendants(h.get('results-content')).some(n=>n.textContent==='Optional add-ons'));assert.ok(descendants(h.get('results-content')).some(n=>n.textContent==='OPTIONAL ADD-ON'));
  await addFixture(h,setProduct('A',2400));await h.run('openProduct(state.result.addons[0],null)');
  assert.equal(h.run('state.active.valid'),true);assert.equal(h.get('add-to-set').disabled,false);await h.run('addActiveToSet()');
  assert.equal(h.run('state.setItems.length'),2);assert.equal(h.run('setSummary().subtotal'),2800);assert.ok(h.calls.some(c=>c.action==='product'&&c.productId===card.id));assert.ok(h.calls.every(c=>c.action==='search'||c.action==='product'));
  const expensive={...card,id:'gid://shopify/p/expensive-card',variants:[{...card.variants[0],id:'gid://shopify/ProductVariant/expensive-card',price:{amount:8000,currency:'USD'}}]};
  await addFixture(h,expensive);assert.equal(h.run('state.setItems.length'),2);
});

test('Theme UI review: required Star Wars search cannot render unrelated main gifts or add-ons',async()=>{
  const themed=product('Blue');themed.id='gid://shopify/p/themed';themed.title='Star Wars ocean mug';
  const unrelated=product();const card={...product('Green'),id:'gid://shopify/p/plain-card',title:'Ocean greeting card'};
  const h=await harness(()=>response({products:[unrelated,themed,card],messages:[]}));h.get('gift-form').values={...profile,likes:'They love Star Wars and the ocean.'};
  await h.run('search()');assert.equal(h.run('state.result.recommendations.length'),1);assert.equal(h.run('state.result.recommendations[0].product.id'),themed.id);assert.equal(h.run('state.result.addons.length'),0);
});

test('Add-ons UI review: explicit greeting-card interest remains available through automatic search',async()=>{
  const card=product();card.title='Handmade greeting card';card.description='Blank paper card';
  const h=await harness(()=>response({products:[card],messages:[]}));h.get('gift-form').values={...profile,likes:'They enjoy gardening and greeting cards.'};
  await h.run('search()');assert.equal(h.run('state.result.recommendations.length'),1);assert.equal(h.run('state.result.addons.length'),0);
});

test('More options UI review: exact next cursor, submitted query and budget fetch new eligible choices without changing the set',async()=>{
  const first=setProduct('First'),next=setProduct('Next');
  const h=await harness((payload,count)=>response(count===1?{products:[first],nextCursor:'opaque:first+/=',messages:[]}:{products:[next],nextCursor:null,messages:[]}));
  await h.run('search()');await addFixture(h,first);const chosen=h.run('state.setItems');const subtotal=h.run('setSummary().subtotal');
  await h.run('loadMoreOptions()');
  assert.deepEqual(h.calls[1],{action:'search',query:h.calls[0].query,budget:profile.budget,cursor:'opaque:first+/='});
  assert.equal(h.run('state.result.recommendations.length'),2);assert.ok(h.run('state.result.recommendations.some(rec=>rec.product.id.endsWith("Next"))'));
  assert.equal(h.run('state.setItems'),chosen);assert.equal(h.run('setSummary().subtotal'),subtotal);assert.equal(h.run('setSummary().valid'),true);assert.equal(h.get('show-more').disabled,true);
  assert.ok(h.calls.every(call=>call.action==='search'));
});

test('More options UI review: duplicate product and variant IDs do not repeat cards and ineligible additions stay hidden',async()=>{
  const first=setProduct('First'),next=setProduct('Next');const duplicateVariant={...first,id:'gid://shopify/p/alternate-id'};
  const silk=setProduct('Silk',2000,undefined,'Silk ocean gift'),expensive=setProduct('Expensive',10000),unavailable=setProduct('Unavailable');unavailable.variants[0].availability.available=false;
  const h=await harness((payload,count)=>response(count===1?{products:[first],nextCursor:'page2',messages:[]}:{products:[first,duplicateVariant,next,next,silk,expensive,unavailable],messages:[]}));
  await h.run('search()');await h.run('loadMoreOptions()');
  assert.equal(h.run('state.result.recommendations.length'),2);
  assert.deepEqual(Array.from(h.run('state.result.recommendations.map(rec=>rec.product.id)')).sort(),[first.id,next.id].sort());
});

test('More options UI review: pending page cannot pollute a newer submitted search',async()=>{
  const pending=deferred(),old=setProduct('Old'),fresh=setProduct('Fresh');
  const h=await harness((payload,count)=>count===2?pending.promise:response({products:[count===1?old:fresh],nextCursor:count===1?'old-page':null,messages:[]}));
  await h.run('search()');const more=h.run('loadMoreOptions()');await h.run('search()');
  pending.resolve(response({products:[setProduct('Stale')],nextCursor:'stale-next',messages:[{type:'warning',content:'Stale merchant warning'}]}));await more;
  assert.deepEqual(Array.from(h.run('state.products.map(p=>p.id)')),[fresh.id]);assert.equal(h.run('state.nextCursor'),null);assert.equal(h.run('state.morePageCount'),0);assert.equal(h.run('state.moreBusy'),false);
  assert.ok(!descendants(h.get('results-content')).some(n=>n.textContent==='Stale merchant warning'));
});

test('More options UI review: pending page respects changed typed constraints and reduced budget',async()=>{
  for(const change of ['likes','budget']){
    const pending=deferred();const h=await harness((payload,count)=>count===1?response({products:[setProduct('First')],nextCursor:'p2',messages:[]}):pending.promise);
    await h.run('search()');const more=h.run('loadMoreOptions()');
    if(change==='likes'){h.get('gift-form').values.likes='They love gardens.';h.get('gift-form').listeners.input({target:{id:'likes'}});}
    else{h.get('budget').value='10';h.get('budget').listeners.input();}
    pending.resolve(response({products:[setProduct('Stale')],nextCursor:'p3',messages:[]}));await more;
    assert.equal(h.run('state.products.length'),1);assert.equal(h.run('state.morePageCount'),0);assert.equal(h.get('show-more').disabled,true);
    const calls=h.calls.length;await h.run('loadMoreOptions()');assert.equal(h.calls.length,calls);
  }
});

test('More options UI review: strict arrival deadline blocks extra requests and cannot gain new eligible results',async()=>{
  const h=await harness(()=>response({products:[setProduct('First')],nextCursor:'p2',messages:[]}));
  h.get('gift-form').values={...profile,mustArrive:'on',arrivalDeadline:'2099-12-31'};await h.run('search()');await h.run('loadMoreOptions()');
  assert.equal(h.calls.length,1);assert.equal(h.run('state.result.recommendations.length'),0);assert.equal(h.get('show-more').disabled,true);assert.doesNotMatch(JSON.stringify(h.calls),/2099|arrival|destination/);
});

test('More options UI review: only one concurrent request and at most three additional pages are allowed',async()=>{
  const pending=deferred();const h=await harness((payload,count)=>count===2?pending.promise:response({products:[setProduct(`Page${count}`)],nextCursor:`cursor${count}`,messages:[]}));
  await h.run('search()');const one=h.run('loadMoreOptions()');await h.run('loadMoreOptions()');assert.equal(h.calls.length,2);
  pending.resolve(response({products:[setProduct('Page2')],nextCursor:'cursor2',messages:[]}));await one;
  await h.run('loadMoreOptions()');await h.run('loadMoreOptions()');await h.run('loadMoreOptions()');
  assert.equal(h.calls.length,4);assert.equal(h.run('state.morePageCount'),3);assert.equal(h.get('show-more').disabled,true);
  assert.deepEqual(h.calls.slice(1).map(call=>call.cursor),['cursor1','cursor2','cursor3']);
});

test('More options UI review: additional AI-mode pages are visibly rules-only and keep the original model selection',async()=>{
  const chosen=setProduct('Chosen'),extra=setProduct('Extra');
  const h=await harness((payload,count)=>count===1?response({modelConnected:true,model:'openai/gpt-4.1-mini',products:[chosen],recommendations:[{productId:chosen.id,variantId:chosen.variants[0].id,reason:'Chosen from live facts.'}],messages:[],toolTrace:[]}):response({products:[chosen,extra],nextCursor:'next',messages:[]}));
  h.get('use-agent').checked=true;await h.run('search()');await h.run('loadMoreOptions()');
  assert.equal(h.requests[0].url,'/api/agent');assert.equal(h.requests[1].url,'/api/shop');assert.deepEqual(Object.keys(h.calls[1]).sort(),['action','budget','query']);
  assert.equal(h.run('state.result.recommendations.length'),1);assert.equal(h.run('state.result.recommendations[0].product.id'),chosen.id);assert.equal(h.run('state.moreProducts.length'),1);
  assert.ok(descendants(h.get('results-content')).some(n=>String(n.textContent).includes('not additional model-selected recommendations')));
  assert.ok(descendants(h.get('results-content')).some(n=>n.textContent===extra.title));
  const extraCard=descendants(h.get('results-content')).find(n=>n.tagName==='article'&&descendants(n).some(child=>child.textContent===extra.title));
  descendants(extraCard).find(n=>n.textContent==='Gift brief').listeners.click();
  assert.match(h.get('brief-text').value,/Ranking is rules-based, not an LLM recommendation/);assert.doesNotMatch(h.get('brief-text').value,/AI-guided selection via/);
});

test('Withdrawn expression UI: no expression input remains in the form',async()=>{const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/id="expression"|id="expression-chips"/);});




test('Expression UI review: rules ignore legacy query and raw meaning, and withdrawn meaning is never shared with AI',async()=>{
  const secret='A private personal expression, not catalog words';
  const rules=await harness(()=>response({products:[],messages:[]}));rules.get('gift-form').values={...profile,query:'PRIVATE LEGACY QUERY',expression:secret};await rules.run('search()');
  assert.deepEqual(rules.calls,[{action:'search',query:'ocean gifts',budget:75}]);assert.doesNotMatch(JSON.stringify(rules.calls),/private|Private|LEGACY/);
  const ai=await harness(()=>response({modelConnected:true,model:'openai/gpt-4.1-mini',products:[],recommendations:[],messages:[],toolTrace:[]}));ai.get('gift-form').values={...profile,query:'PRIVATE LEGACY QUERY',expression:secret};ai.get('use-agent').checked=true;await ai.run('search()');
  assert.equal(ai.calls[0].expression,'');assert.equal(ai.calls[0].query,'ocean gifts');assert.doesNotMatch(JSON.stringify(ai.calls),/Private Name|LEGACY|recipient|relationship/);
});


test('Search plan UI review: mixed interests use focused parallel queries, merge unique listings, and page the exact first query',async()=>{
  const ocean=setProduct('Ocean'),garden=setProduct('Garden'),extra=setProduct('MoreOcean');garden.title='Gardening kit';garden.description='Botanical tools for gardening.';
  const h=await harness(payload=>response(payload.cursor?{products:[extra],messages:[]}:{products:payload.query==='ocean walks gifts'?[ocean]:[garden,ocean],nextCursor:payload.query==='ocean walks gifts'?'ocean-cursor':'garden-cursor',messages:[]}));
  h.get('gift-form').values={...profile,likes:'They enjoy ocean walks and gardening.'};await h.run('search()');
  assert.deepEqual(h.calls,[{action:'search',query:'ocean walks gifts',budget:75},{action:'search',query:'gardening gifts',budget:75}]);
  assert.equal(h.run('state.result.recommendations.length'),2);assert.equal(h.run('state.products.length'),2);
  assert.ok(h.run('state.result.recommendations.some(rec=>rec.product.title==="Gardening kit")'));
  await addFixture(h,ocean);const set=h.run('state.setItems');await h.run('loadMoreOptions()');
  assert.deepEqual(h.calls[2],{action:'search',query:'ocean walks gifts',budget:75,cursor:'ocean-cursor'});assert.equal(h.run('state.result.recommendations.length'),3);assert.equal(h.run('state.setItems'),set);
});

test('Search plan UI review: exact named-theme retrieval is not narrowed by unrelated interests or demographic suffixes',async()=>{
  const themed=product();themed.title='Star Wars mug';
  const h=await harness(()=>response({products:[themed],nextCursor:'theme-page',messages:[]}));
  h.get('gift-form').values={...profile,likes:'They love Star Wars, coffee and gardening.',audience:'men',ageBand:'30-44'};await h.run('search()');await h.run('loadMoreOptions()');
  assert.deepEqual(h.calls,[{action:'search',query:'Star Wars',budget:75},{action:'search',query:'Star Wars mugs',budget:75},{action:'search',query:'Star Wars collectibles',budget:75},{action:'search',query:'Star Wars',budget:75,cursor:'theme-page'}]);
  assert.equal(h.run('state.profile.audience'),'men');assert.equal(h.run('state.profile.ageBand'),'30-44');assert.equal(h.run('state.result.recommendations.length'),1);
});

const uiText=root=>descendants(root).map(n=>String(n.textContent??'')).join('\n');
function clickMeaning(h,text){h.get('expression-chips').children.find(node=>node.textContent===text).listeners.click();}
const emptyAgent=(extra={})=>({modelConnected:true,model:'openai/gpt-4.1-mini',products:[],recommendations:[],messages:[],toolTrace:['Searched live Shop catalog','Refreshed an observed Shop product'],...extra});


test('Gift context UI review: changing meaning, style or lifestyle invalidates set review without sending data',async()=>{
  for(const field of ['style','lifestyle']){
    const h=await harness(()=>{throw new Error('Context edits cannot dispatch');});await addFixture(h,setProduct('Context'));assert.equal(h.run('setSummary().valid'),true);
    if(field==='meaning')clickMeaning(h,'Courage');else{h.get('gift-form').values[field]=field==='style'?'classic':'office';h.get('gift-form').listeners.input({target:{id:field}});}
    assert.equal(h.run('state.preferencesDirty'),true);assert.equal(h.run('state.setItems[0].reviewed'),false);assert.equal(h.run('setSummary().valid'),false);
    await h.run("createSetCheckout('fixture.myshopify.com')");assert.equal(h.calls.length,0);
  }
});

test('Gift context UI review: style, lifestyle and audience have separate controls and consented AI fields',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');assert.match(html,/<label for="audience">Audience /);assert.match(html,/<label for="style">Style /);assert.match(html,/<label for="lifestyle">Lifestyle /);assert.doesNotMatch(html,/Style \/ audience/);
  const values={...profile,style:'minimalist',lifestyle:'healthcare',audience:'men',expression:'A fresh chapter'};
  const h=await harness(()=>response(emptyAgent()));h.get('gift-form').values=values;h.get('use-agent').checked=true;assert.equal(h.calls.length,0);await h.run('search()');
  assert.equal(h.requests[0].url,'/api/agent');assert.equal(h.calls[0].style,'minimalist');assert.equal(h.calls[0].lifestyle,'healthcare');assert.equal(h.calls[0].audience,'men');assert.equal(h.calls[0].expression,'');assert.equal(h.calls[0].consent,true);
  assert.doesNotMatch(JSON.stringify(h.calls),/Private Name|recipient|relationship/);
  const rules=await harness(()=>response({products:[],messages:[]}));rules.get('gift-form').values=values;await rules.run('search()');
  assert.deepEqual(rules.calls,[{action:'search',query:"ocean gifts men's",budget:75}]);assert.doesNotMatch(JSON.stringify(rules.calls),/minimalist|healthcare|A fresh chapter|style|lifestyle|Private Name/);
});

test('Gift context UI review: invalid style or lifestyle fails before any provider request',async()=>{
  for(const field of ['style','lifestyle']){const h=await harness(()=>{throw new Error('Invalid context cannot dispatch');});h.get('gift-form').values={...profile,[field]:'men'};h.get('use-agent').checked=true;await h.run('search()');assert.equal(h.calls.length,0);assert.equal(h.get('form-errors').hidden,false);}
});

test('Empty diagnostics UI review: found twelve, refreshed ten, empty model shortlist is not an empty catalog',async()=>{
  const h=await harness(()=>response(emptyAgent({catalogCounts:{observed:12,refreshed:10,selected:0},selectionDiagnostics:{modelProposedCount:0,acceptedCount:0,rejectionCounts:{},zeroSelectionReason:'model_empty'}})));h.get('use-agent').checked=true;await h.run('search()');
  const text=uiText(h.get('results-content'));assert.match(text,/found 12 distinct catalog listings, refreshed 10, and selected 0/);assert.match(text,/model proposed 0 main gifts; 0 passed server checks/);assert.match(text,/model did not propose any main gifts/);assert.match(text,/not an empty catalog/);assert.doesNotMatch(text,/Shop returned no products|catalog searches returned no products/);
});

test('Empty diagnostics UI review: rejected proposals show safe reason counts, not fabricated inventory claims',async()=>{
  const h=await harness(()=>response(emptyAgent({catalogCounts:{observed:12,refreshed:10,selected:0},selectionDiagnostics:{modelProposedCount:3,acceptedCount:0,rejectionCounts:{addon:1,stock:1,budget:1,unknown_private_reason:'PRIVATE RAW ERROR'},zeroSelectionReason:'model_filtered'}})));h.get('use-agent').checked=true;await h.run('search()');
  const text=uiText(h.get('results-content'));assert.match(text,/model proposed 3 main gifts; 0 passed server checks/);assert.match(text,/1: Optional add-on, not a primary gift/);assert.match(text,/1: Availability not confirmed/);assert.match(text,/1: Over item budget/);assert.match(text,/none passed the verified purchase and preference checks/);assert.doesNotMatch(text,/PRIVATE RAW ERROR|Shop returned no products|catalog searches returned no products/);
});

test('Empty diagnostics UI review: older responses with observed listings retain an honest unknown-selection explanation',async()=>{
  const h=await harness(()=>response(emptyAgent({catalogCounts:{observed:12,refreshed:10,selected:0}})));h.get('use-agent').checked=true;await h.run('search()');const text=uiText(h.get('results-content'));
  assert.match(text,/Shop found 12 listings/);assert.match(text,/does not distinguish an empty model shortlist from rejected proposals/);assert.doesNotMatch(text,/Shop returned no products|catalog searches returned no products/);
});

test('Empty diagnostics UI review: a genuine no-catalog response is distinct from local exclusion of an accepted shortlist',async()=>{
  const empty=await harness(()=>response(emptyAgent({catalogCounts:{observed:0,refreshed:0,selected:0},selectionDiagnostics:{modelProposedCount:0,acceptedCount:0,rejectionCounts:{},zeroSelectionReason:'no_catalog'}})));empty.get('use-agent').checked=true;await empty.run('search()');assert.match(uiText(empty.get('results-content')),/catalog searches returned no products/);
  const p=product('Red','Scented cotton ocean gift');const h=await harness(()=>response(emptyAgent({products:[p],recommendations:[{productId:p.id,variantId:p.variants[0].id,reason:'Verified catalog choice.'}],catalogCounts:{observed:12,refreshed:10,selected:1},selectionDiagnostics:{modelProposedCount:1,acceptedCount:1,rejectionCounts:{},zeroSelectionReason:null}})));h.get('use-agent').checked=true;await h.run('search()');assert.equal(h.run('state.result.recommendations.length'),1);
  h.get('exclusion-chips').children.find(n=>n['aria-label']==='Fragranced items').listeners.click();assert.equal(h.run('state.result.recommendations.length'),0);assert.equal(h.calls.length,1);
  const text=uiText(h.get('results-content'));assert.match(text,/none remains eligible under the current local exclusions/);assert.match(text,/1: Excluded by your choices/);assert.doesNotMatch(text,/Shop returned no products|model did not propose any main gifts|catalog searches returned no products/);
});

const technicalFailure=(code='AGENT_LIMIT',stage='tool_arguments')=>({ok:false,json:async()=>({error:{code,stage,message:'The model did not finish this run.'}})});
const recoveredCatalog=(products=[product()],override={})=>({modelConnected:false,products,recommendations:[],addonProducts:[],messages:[],recovery:{mode:'rules',code:'AGENT_LIMIT',stage:'tool_arguments',observedCount:12,refreshedCount:10},...override});

test('Recovery UI review: valid catalog recovery is transparently rules-only and refreshes the real exact variant',async()=>{
  const p=product();const h=await harness(payload=>payload.action==='product'?response({product:p,messages:[]}):response(recoveredCatalog([p])));h.get('use-agent').checked=true;await h.run('search()');
  assert.equal(h.calls.length,1);assert.equal(h.run('state.agentResult'),null);assert.equal(h.run('state.recoveryInfo.mode'),'rules');assert.equal(h.run('state.result.recommendations[0].variant.id'),p.variants[0].id);
  assert.match(h.get('engine-badge').textContent,/rules/i);assert.doesNotMatch(h.get('engine-badge').textContent,/AI-guided/);assert.match(uiText(h.get('results-content')),/not AI-selected recommendations|not AI recommendations|not an AI recommendation|not a completed AI|not model-selected/i);
  h.run('openBrief(state.result.recommendations[0])');assert.match(h.get('brief-text').value,/Ranking is rules-based/);assert.doesNotMatch(h.get('brief-text').value,/AI-guided selection via/);
  await h.run('openProduct(state.result.recommendations[0],null)');assert.equal(h.run('state.active.modelGuided'),false);assert.equal(h.run('state.active.valid'),true);
  assert.deepEqual(h.calls[1],{action:'product',productId:p.id,selected:p.selected,budget:75});assert.ok(h.calls.every(call=>call.action!=='checkout'&&call.action!=='checkout_set'));
});

test('Recovery UI review: only valid allowlisted recovery envelopes can become rules results',async()=>{
  const base=recoveredCatalog();
  const invalid=[
    {...base,modelConnected:true}, {...base,recommendations:[{productId:product().id,variantId:product().variants[0].id}]},
    {...base,recovery:{...base.recovery,mode:'ai'}}, {...base,recovery:{...base.recovery,code:'AGENT_AUTH'}}, {...base,recovery:{...base.recovery,stage:'UNTRUSTED_STAGE'}},
    {...base,recovery:{...base.recovery,observedCount:-1}}, {...base,recovery:{...base.recovery,observedCount:0}}, {...base,recovery:{...base.recovery,observedCount:1.5}},
    {...base,recovery:{...base.recovery,observedCount:999999}}, {...base,recovery:{...base.recovery,refreshedCount:13}},
    {...base,recovery:{...base.recovery,code:'AGENT_INVALID_RESPONSE',stage:'recommendation_validation'}},
  ];
  for(const envelope of invalid){const h=await harness(()=>response(envelope));h.get('use-agent').checked=true;await h.run('search()');assert.equal(h.calls.length,1,JSON.stringify(envelope.recovery));assert.equal(h.run('state.agentResult'),null);assert.ok(!h.run('state.result?.recommendations?.length'));assert.ok(!h.run('state.recoveryInfo'));}
  const allowed=await harness(()=>response(recoveredCatalog([product()],{recovery:{...base.recovery,code:'AGENT_INVALID_RESPONSE',stage:'tool_arguments'}})));allowed.get('use-agent').checked=true;await allowed.run('search()');assert.equal(allowed.run('state.result.recommendations.length'),1);assert.equal(allowed.run('state.agentResult'),null);
});

test('Recovery UI review: technical HTTP failure runs one bounded focused-rules pass and preserves selected gifts',async()=>{
  for(const code of ['AGENT_LIMIT','AGENT_TIMEOUT','AGENT_UPSTREAM']){
    const h=await harness(payload=>payload.consent?technicalFailure(code):response({products:[product()],nextCursor:'more',messages:[]}));await addFixture(h,setProduct('Retained'));const set=h.run('state.setItems'),subtotal=h.run('setSummary().subtotal');
    h.get('use-agent').checked=true;h.get('gift-form').values={...profile,likes:'They love ocean, gardening and coffee.'};await h.run('search()');
    assert.equal(h.requests.filter(request=>request.url==='/api/agent').length,1);assert.equal(h.requests.filter(request=>request.url==='/api/shop').length,3);assert.ok(h.calls.filter(call=>call.action==='search').every(call=>call.budget===75));
    assert.deepEqual(new Set(h.calls.filter(call=>call.action==='search').map(call=>call.query)),new Set(['ocean gifts','gardening gifts','coffee gifts']));
    assert.equal(h.run('state.agentResult'),null);assert.equal(h.run('state.result.recommendations.length'),1);assert.equal(h.run('state.setItems'),set);assert.equal(h.run('setSummary().subtotal'),subtotal);assert.match(h.get('engine-badge').textContent,/rules/i);
  }
});

test('Recovery UI review: auth, input, security and unverified AI errors never trigger fresh catalog fallback',async()=>{
  for(const code of ['AGENT_AUTH','AGENT_UNAVAILABLE','AGENT_CREDITS','INVALID_AGENT_INPUT','INVALID_REQUEST','AGENT_TOOL_NOT_ALLOWED','AGENT_INVALID_RESPONSE','MODEL_NOT_CONFIGURED']){
    const h=await harness(()=>technicalFailure(code));h.get('use-agent').checked=true;await h.run('search()');assert.equal(h.calls.length,1,code);assert.equal(h.requests[0].url,'/api/agent');assert.equal(h.run('state.agentResult'),null);assert.ok(!h.run('state.recoveryInfo'));assert.ok(!h.run('state.result?.recommendations?.length'));
  }
});

test('Recovery UI review: Star Wars audience, budget and exclusions remain hard constraints in both recovery paths',async()=>{
  const safe=setProduct('Safe');safe.title='Star Wars mug';safe.description="Men's ceramic Star Wars mug, ages 30-44.";
  const scented=structuredClone(safe);scented.id+='-scented';scented.variants[0].id+='-scented';scented.description+=' Scented fragrance finish.';
  const over=structuredClone(safe);over.id+='-over';over.variants[0].id+='-over';over.variants[0].price.amount=10001;
  const wrongAudience=structuredClone(safe);wrongAudience.id+='-women';wrongAudience.variants[0].id+='-women';wrongAudience.description="Women's Star Wars mug, ages 30-44.";
  const unrelated=setProduct('Unrelated');const silk=structuredClone(safe);silk.id+='-silk';silk.variants[0].id+='-silk';silk.description+=' Silk lining.';
  for(const recovered of [true,false]){
    const products=[safe,scented,over,wrongAudience,unrelated,silk];const h=await harness(payload=>payload.consent?(recovered?response(recoveredCatalog(products)):technicalFailure()):response({products,messages:[]}));
    h.get('gift-form').values={...profile,likes:'They love Star Wars.',audience:'men',ageBand:'30-44',occasion:'Thank you',budget:100};h.get('use-agent').checked=true;h.run("state.excludedFactors=['fragrance']");await h.run('search()');
    assert.equal(h.run('state.result.recommendations.length'),1);assert.equal(h.run('state.result.recommendations[0].product.id'),safe.id);assert.equal(h.run('state.profile.budget'),100);assert.equal(h.run('state.profile.audience'),'men');assert.equal(h.run('state.profile.ageBand'),'30-44');assert.deepEqual(Array.from(h.run('state.excludedFactors')),['fragrance']);assert.equal(h.run('state.profile.dislikes'),'silk');
    if(!recovered)assert.deepEqual(h.calls[1],{action:'search',query:'Star Wars',budget:100});assert.equal(h.requests.filter(request=>request.url==='/api/agent').length,1);
  }
});

test('Recovery UI review: newer submitted search wins over a late recovery envelope',async()=>{
  const pending=deferred(),fresh=setProduct('Fresh');const h=await harness(payload=>payload.consent?pending.promise:response({products:[fresh],messages:[]}));h.get('use-agent').checked=true;const old=h.run('search()');h.get('use-agent').checked=false;await h.run('search()');
  pending.resolve(response(recoveredCatalog([setProduct('Stale')])));await old;
  assert.deepEqual(Array.from(h.run('state.products.map(p=>p.id)')),[fresh.id]);assert.equal(h.run('state.agentResult'),null);assert.ok(!h.run('state.recoveryInfo'));assert.equal(h.calls.length,2);
});

test('Recovery UI review: dirty preferences or changed budget prevent stale recovery and prevent new fallback requests',async()=>{
  for(const change of ['likes','budget'])for(const envelope of [true,false]){
    const pending=deferred();const h=await harness(()=>pending.promise);h.get('use-agent').checked=true;const search=h.run('search()');
    if(change==='likes'){h.get('gift-form').values.likes='They love gardens.';h.get('gift-form').listeners.input({target:{id:'likes'}});}else{h.get('budget').value='10';h.get('budget').listeners.input();}
    pending.resolve(envelope?response(recoveredCatalog()):technicalFailure());await search;
    assert.equal(h.calls.length,1,`${change}/${envelope}`);assert.equal(h.run('state.products.length'),0);assert.ok(!h.run('state.result?.recommendations?.length'));assert.ok(!h.run('state.recoveryInfo'));
  }
});

test('Recovery UI review: a pending fresh-catalog fallback cannot overwrite a newer search',async()=>{
  const pending=deferred(),started=deferred(),fresh=setProduct('Fresh');let reads=0;
  const h=await harness(payload=>{if(payload.consent)return technicalFailure();if(++reads===1){started.resolve();return pending.promise;}return response({products:[fresh],messages:[]});});
  h.get('use-agent').checked=true;const old=h.run('search()');await started.promise;h.get('use-agent').checked=false;await h.run('search()');pending.resolve(response({products:[setProduct('Stale')],messages:[]}));await old;
  assert.deepEqual(Array.from(h.run('state.products.map(p=>p.id)')),[fresh.id]);assert.equal(h.run('state.agentResult'),null);assert.ok(!h.run('state.recoveryInfo'));assert.equal(h.calls.length,3);
});

test('Recovery UI review: unavailable fresh catalog ends clearly without another model loop or invented products',async()=>{
  const h=await harness(payload=>payload.consent?technicalFailure('AGENT_TIMEOUT'):{ok:false,json:async()=>({error:{code:'SHOP_UPSTREAM',message:'Catalog unavailable. Try again later.'}})});h.get('use-agent').checked=true;await h.run('search()');
  assert.equal(h.calls.length,2);assert.equal(h.requests.filter(request=>request.url==='/api/agent').length,1);assert.equal(h.run('state.products.length'),0);assert.equal(h.run('state.agentResult'),null);assert.ok(!h.run('state.result?.recommendations?.length'));
  assert.match(uiText(h.get('results-content')),/unavailable|retry|try again/i);assert.doesNotMatch(uiText(h.get('results-content')),/Shop returned no products|catalog searches returned no products/);
});

test('Recovery UI review: strict arrival requirement cannot become eligible through either recovery path',async()=>{
  for(const envelope of [true,false]){const h=await harness(payload=>payload.consent?(envelope?response(recoveredCatalog()):technicalFailure()):response({products:[product()],messages:[]}));h.get('gift-form').values={...profile,mustArrive:'on',arrivalDeadline:'2099-12-31'};h.get('use-agent').checked=true;await h.run('search()');assert.equal(h.run('state.result.recommendations.length'),0);assert.match(uiText(h.get('results-content')),/Can’t verify delivery/);assert.doesNotMatch(JSON.stringify(h.calls),/2099|arrivalDeadline|destination/);}
});

test('Recovery UI review: merchant warnings survive both observed-snapshot and fresh-search recovery',async()=>{
  const warning={type:'warning',content:'Merchant notice: verify the listed material before choosing.'};
  for(const envelope of [true,false]){
    const h=await harness(payload=>payload.consent?(envelope?response(recoveredCatalog([product()],{messages:[warning]})):technicalFailure()):response({products:[product()],messages:[warning]}));h.get('use-agent').checked=true;await h.run('search()');
    assert.ok(descendants(h.get('results-content')).some(node=>node.textContent===warning.content));assert.equal(h.run('state.agentResult'),null);
  }
});

test('Ready-only UI review: custom paths are hidden and custom rendering is neither imported nor initialized',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8'),app=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
  assert.match(html,/<nav[^>]*hidden[^>]*class="gift-paths"/);assert.match(html,/<div[^>]*hidden[^>]*class="gift-mode-switch"/);assert.match(html,/<div id="custom-workspace" hidden/);assert.doesNotMatch(app,/import[^\n]*custom-panel|initCustomPanel\(/);
  const h=await harness(()=>{throw new Error('Canceled mode must not call a provider');});h.run("setGiftMode('custom')");assert.equal(h.run('state.giftMode'),'ready');assert.equal(h.get('custom-workspace').hidden,true);assert.equal(h.get('ready-made-content').hidden,false);assert.equal(h.custom.options,null);assert.equal(h.calls.length,0);
});

test('Ready-only UI review: withdrawn meaning cannot survive in saved inputs or snapshots',async()=>{const h=await harness(()=>response({products:[product()],messages:[]}));h.get('gift-form').values={...profile,expression:'Protection and care'};h.run("state.expressionChoices=['Courage']");await h.run('search()');assert.equal(h.run('state.submittedProfile.expression'),'');await h.run("search({...state.submittedInput,expression:'Old hidden meaning'})");assert.equal(h.run('state.submittedProfile.expression'),'');assert.doesNotMatch(JSON.stringify(h.calls),/Protection|Courage|Old hidden/);});

function shirtFixture(label='Shirt'){
  const p=setProduct(label);p.title='Star Wars T-shirt';p.description="Men's cotton Star Wars T-shirt.";p.options=[{name:'Size',values:[{label:'S'},{label:'M'},{label:'L'}]}];p.selected=[{name:'Size',label:'M'}];p.variants[0].options=p.selected;return p;
}
function mugFixture(label='Mug',amount=2400){const p=setProduct(label,amount);p.title=`Star Wars ceramic mug ${label}`;p.description="Men's Star Wars ceramic mug, age 30-44.";return p;}

test('Alternative categories UI review: sizing exclusion hides shirts and fetches real mugs only once without changing the selected set',async()=>{
  const shirt=shirtFixture(),mug=mugFixture(),over=mugFixture('Over',10001),unrelated=setProduct('Plain');let searching=0;
  const h=await harness(()=>response({products:++searching<=3?[shirt]:[shirt,mug,over,unrelated],messages:[]}));h.get('gift-form').values={...profile,likes:'They love Star Wars.',audience:'men',ageBand:'30-44',budget:100};await h.run('search()');assert.equal(h.calls.length,3);assert.equal(h.run('state.result.recommendations.length'),1);
  await addFixture(h,mug);const set=h.run('state.setItems'),subtotal=h.run('setSummary().subtotal');h.get('exclusion-chips').children.find(n=>n['aria-label']==='Requires a size choice').listeners.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.length,5);assert.deepEqual(h.calls.slice(3),[{action:'search',query:'Star Wars mugs',budget:100},{action:'search',query:'Star Wars collectibles',budget:100}]);
  assert.equal(h.run('state.result.recommendations.length'),1);assert.equal(h.run('state.result.recommendations[0].product.id'),mug.id);assert.equal(h.run('state.setItems'),set);assert.equal(h.run('setSummary().subtotal'),subtotal);assert.ok(!uiText(h.get('results-content')).includes('Star Wars T-shirt'));
  h.run('render()');await h.run('recoverExcludedOptions()');assert.equal(h.calls.length,5);assert.ok(h.calls.every(call=>call.action==='search'));assert.match(uiText(h.get('results-content')),/Checked two alternative product types once/);
});

test('Alternative categories UI review: AI-shortlist exclusions reveal only labeled rules extras, never another model call',async()=>{
  const shirt=shirtFixture(),mug=mugFixture();const h=await harness(payload=>payload.consent?response(emptyAgent({products:[shirt],recommendations:[{productId:shirt.id,variantId:shirt.variants[0].id,reason:'Verified shirt.'}]})):response({products:[mug],messages:[]}));h.get('gift-form').values={...profile,likes:'They love Star Wars.',budget:100};h.get('use-agent').checked=true;await h.run('search()');
  h.get('exclusion-chips').children.find(n=>n['aria-label']==='Clothes & shoes').listeners.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.length,3);assert.equal(h.requests.filter(r=>r.url==='/api/agent').length,1);assert.equal(h.run('state.result.recommendations.length'),0);assert.equal(h.run('state.moreProducts.length'),1);
  assert.match(uiText(h.get('results-content')),/not additional model-selected recommendations/);const card=descendants(h.get('results-content')).find(n=>n.tagName==='article'&&uiText(n).includes(mug.title));assert.ok(card);descendants(card).find(n=>n.textContent==='Gift brief').listeners.click();assert.match(h.get('brief-text').value,/Ranking is rules-based/);
});

test('Category UI review: no more than five real eligible listings are displayed per category',async()=>{
  const shirts=Array.from({length:8},(_,i)=>shirtFixture(`Shirt${i}`)),mugs=Array.from({length:7},(_,i)=>mugFixture(`Mug${i}`));const h=await harness(()=>response({products:[...shirts,...mugs],messages:[]}));h.get('gift-form').values={...profile,likes:'They love Star Wars.',budget:100};await h.run('search()');
  const counts=Array.from(h.run('state.result.recommendations.map(rec=>rec.category.groupId)')).reduce((out,id)=>(out[id]=(out[id]||0)+1,out),{});assert.equal(Object.keys(counts).length,2);assert.deepEqual(Object.values(counts).sort(),[5,5]);assert.equal(descendants(h.get('results-content')).filter(n=>n.tagName==='article').length,10);assert.match(uiText(h.get('results-content')),/Up to five per category/);
});

test('Alternative categories UI review: stale extra reads are discarded after preferences, factors or search change',async()=>{
  for(const change of ['preferences','factors','search']){
    const pending=deferred(),shirt=shirtFixture(),mug=mugFixture();let calls=0;
    const h=await harness(()=>++calls<=3?response({products:[shirt],messages:[]}):calls<=5?pending.promise:response({products:[],messages:[]}));h.get('gift-form').values={...profile,likes:'They love Star Wars.',budget:100};await h.run('search()');
    h.get('exclusion-chips').children.find(n=>n['aria-label']==='Requires a size choice').listeners.click();assert.equal(h.calls.length,5);
    if(change==='preferences'){h.get('gift-form').values.dislikes='ceramic';h.get('gift-form').listeners.input({target:{id:'dislikes'}});}
    else if(change==='factors'){h.get('exclusion-chips').children.find(n=>n['aria-label']==='Fragranced items').listeners.click();}
    else{h.run('state.excludedFactors=[]');await h.run('search()');}
    pending.resolve(response({products:[mug],messages:[{type:'warning',content:'STALE EXTRA WARNING'}]}));await new Promise(resolve=>setImmediate(resolve));
    assert.ok(!h.run('state.products.some(p=>p.id.endsWith("Mug"))'));assert.ok(!uiText(h.get('results-content')).includes('STALE EXTRA WARNING'));assert.equal(h.run('state.diversifyBusy'),false);
  }
});

test('Product-first UI: repeated catalog notes and model diagnostics are collapsed after product cards',async()=>{
  const p=setProduct('Chosen');const info={type:'info',content:'Prices shown in USD.'};
  const h=await harness(()=>response({modelConnected:true,model:'test-model',products:[p],recommendations:[{productId:p.id,variantId:p.variants[0].id,reason:'A matching gift.'}],messages:[info,{...info,path:'$.products[1]'},info],toolTrace:[{}],catalogCounts:{observed:12,refreshed:10,selected:1}}));
  h.get('use-agent').checked=true;await h.run('search()');const host=h.get('results-content');const details=host.children.find(n=>n.className==='search-details');
  assert.ok(details);assert.equal(details.tagName,'details');assert.notEqual(details.open,true);assert.equal(details.children[0].textContent,'Search details');assert.ok(host.children.findIndex(n=>n.className==='catalog-category')<host.children.indexOf(details));
  assert.equal(descendants(details).filter(n=>n.textContent==='Prices shown in USD.').length,1);assert.match(uiText(details),/Model tool use/);assert.ok(host.children.filter(n=>n!==details).every(n=>!uiText(n).includes('Model tool use')));assert.match(uiText(host),/Shipping and tax are extra/);
});

test('Product-first UI: empty results still retain collapsed details and merchant warnings remain visible',async()=>{
 const h=await harness(()=>response({products:[],messages:[{type:'warning',content:'Check merchant restrictions.'},{type:'info',content:'Catalog context.'}]}));await h.run('search()');const host=h.get('results-content');const details=host.children.find(n=>n.className==='search-details');assert.ok(details);assert.notEqual(details.open,true);assert.match(uiText(details),/Catalog context/);assert.ok(host.children.some(n=>n!==details&&uiText(n).includes('Check merchant restrictions.')));
});

test('Compact form: only recipient, interests and budget default visible; preference values persist and active choices are indicated',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');const form=html.match(/<form id="gift-form"[\s\S]*?<\/form>/)[0];const optional=form.match(/<details id="more-preferences"[\s\S]*?<\/details>/)[0];assert.doesNotMatch(optional.split('>')[0],/\bopen\b/);for(const id of ['relationship','occasion','age-band','audience','style','lifestyle','exclusion-chips','use-agent'])assert.ok(optional.includes(`id="${id}"`));for(const id of ['recipient','likes','budget','dislikes']){assert.ok(form.includes(`id="${id}"`));assert.ok(!optional.includes(`id="${id}"`));}assert.doesNotMatch(optional,/<(?:input|textarea|select)[^>]*\srequired(?:\s|>)/);
 const h=await harness(()=>response({products:[],messages:[]}));h.get('gift-form').values={...profile,ageBand:'30-44',audience:'men',expression:'Protection and care'};h.get('use-agent').checked=true;h.run("state.excludedFactors=['sizing'];updatePreferencesSummary()");assert.match(h.get('preferences-summary').textContent,/active/);assert.equal(h.get('gift-form').values.expression,'Protection and care');assert.deepEqual(Array.from(h.run('state.excludedFactors')),['sizing']);
});
