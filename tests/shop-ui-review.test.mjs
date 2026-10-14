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
  const roots=new Map();const calls=[];
  const get=id=>{
    for(const root of roots.values()){const found=descendants(root).find(n=>n.id===id);if(found)return found;}
    if(!roots.has(id)){const node=new Element(id);node.id=id;roots.set(id,node);}
    return roots.get(id);
  };
  get('gift-form').values={...profile};
  const context=vm.createContext({...shop,reviewContent,URL,crypto:webcrypto,TextEncoder,Uint8Array,structuredClone,
    document:{getElementById:get,createElement:tag=>new Element(tag)},
    window:{innerWidth:1000},navigator:{},
    FormData:class{constructor(form){return Object.entries(form.values);}},
    fetch:async(url,options)=>{const payload=JSON.parse(options.body);calls.push(payload);return responder(payload,calls.length);},
  });
  const app=(await readFile(new URL('../public/app.mjs',import.meta.url),'utf8')).replace(/^import[^\n]*\n/gm,'');
  vm.runInContext(app,context);
  const run=source=>vm.runInContext(source,context);
  context.fixtureProfile={...profile};context.fixtureProduct=product();
  run('state.profile=fixtureProfile;state.active={rec:{product:fixtureProduct,variant:fixtureProduct.variants[0]},product:null,variant:null,selected:fixtureProduct.selected,requested:fixtureProduct.selected,profile:{...fixtureProfile},valid:false};');
  return {get,run,calls,context};
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
