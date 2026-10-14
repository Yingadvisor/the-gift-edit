import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeGiftSet, canAddToGiftSet, setItemKey} from '../src/gift-set.mjs';
function item(id = '1', shop = 'one.myshopify.com', amount = 1200) {
  const options = [{name:'Color',label:'Blue'}];
  const variant = {id, options, seller:{domain:shop,name:shop}, price:{amount,currency:'USD'}, availability:{available:true},url:'https://example.com/product?original=1'};
  return {product:{id:`product-${id}`,selected:options,variants:[variant],media:[{url:'https://example.com/original.png'}]},variant,selected:options,reviewed:true,detailsHash:'a'.repeat(64)};
}
test('exact cents, remaining and separate merchant groups', () => {
  const a = item('a'), b = item('b','two.myshopify.com',803);
  const result = summarizeGiftSet([a,b],30.05);
  assert.equal(result.valid,true); assert.equal(result.subtotal,2003); assert.equal(result.remaining,1002);
  assert.deepEqual(result.groups.map(g => [g.shop,g.subtotal]),[['one.myshopify.com',1200],['two.myshopify.com',803]]);
  assert.equal(result.groups[0].items[0],a);
});
test('same merchant collates into one group', () => {
  const result = summarizeGiftSet([item('a'),item('b')],24);
  assert.equal(result.groups.length,1); assert.equal(result.groups[0].subtotal,2400); assert.equal(result.remaining,0);
});
test('budget reduction reports negative remaining without deleting items', () => {
  const entries = [item()]; const result = summarizeGiftSet(entries,10);
  assert.equal(result.overBudget,true); assert.equal(result.valid,false); assert.equal(result.remaining,-200); assert.equal(entries.length,1);
});
test('duplicate variants and quantities above one cannot checkout or add', () => {
  assert.equal(summarizeGiftSet([item(),item()],100).valid,false);
  assert.equal(canAddToGiftSet([item()],item(),100).allowed,false);
  assert.equal(summarizeGiftSet([{...item(),quantity:2}],100).valid,false);
  assert.equal(setItemKey(item('EXACT-ID')),'EXACT-ID'); assert.equal(setItemKey({}),null);
});
test('six unique variants maximum', () => {
  const six = Array.from({length:6},(_,i) => item(String(i),undefined,100));
  assert.equal(summarizeGiftSet(six,100).valid,true);
  assert.equal(canAddToGiftSet(six,item('7'),100).allowed,false);
  assert.equal(summarizeGiftSet([...six,item('7')],100).valid,false);
});
test('free products are valid but absent prices and unavailable stock fail closed', () => {
  assert.equal(summarizeGiftSet([item('free',undefined,0)],1).valid,true);
  for (const change of [{price:undefined},{price:{amount:-1,currency:'USD'}},{price:{amount:1.1,currency:'USD'}},{price:{amount:0,currency:'CAD'}},{availability:{available:false}},{availability:{}},{seller:{}},{id:''}]) {
    const entry=item(); Object.assign(entry.variant,change);
    assert.equal(summarizeGiftSet([entry],100).valid,false); assert.equal(canAddToGiftSet([],entry,100).allowed,false);
  }
});
test('bounded budgets use cents and reject invalid precision', () => {
  for (const budget of [0,-1,10000.01,Infinity,NaN,undefined,'100',1.001]) {
    assert.equal(summarizeGiftSet([item()],budget).valid,false); assert.equal(canAddToGiftSet([],item(),budget).allowed,false);
  }
  assert.equal(summarizeGiftSet([item()],10000).valid,true);
  assert.equal(summarizeGiftSet([item('p',undefined,29)],0.29).valid,true);
  assert.equal(canAddToGiftSet([item()],item('b'),23.99).allowed,true);
});
test('adding an unreviewed candidate is allowed but checkout requires review and hash', () => {
  const candidate={...item(),reviewed:false,detailsHash:undefined};
  assert.equal(canAddToGiftSet([],candidate,100).allowed,true); assert.equal(summarizeGiftSet([candidate],100).valid,false);
  for (const hash of [undefined,'abc','g'.repeat(64)]) assert.equal(summarizeGiftSet([{...item(),detailsHash:hash}],100).valid,false);
});
test('relaxed or malformed selected options never pass exact selection review', () => {
  const red = [{name:'Color',label:'Red'}];
  assert.equal(summarizeGiftSet([{...item(),selected:red}],100).valid,false);
  for (const selected of [undefined,null,{},[{}],[{name:'Color',label:'Blue'},{name:'Color',label:'Blue'}]]) assert.equal(summarizeGiftSet([{...item(),selected}],100).valid,false);
  const missing=item(); delete missing.product.selected; assert.equal(summarizeGiftSet([missing],100).valid,false);
  const empty=item(); empty.product.selected=[]; empty.variant.options=[]; empty.selected=[]; assert.equal(summarizeGiftSet([empty],100).valid,true);
});
test('invalid array, identifiers, unsafe sum and missing currency never yield a valid set', () => {
  for (const items of [null,{},[],[null],[{}]]) assert.equal(summarizeGiftSet(items,100).valid,false);
  const noProduct=item(); delete noProduct.product.id; assert.equal(summarizeGiftSet([noProduct],100).valid,false);
  const overflow=[item('a',undefined,Number.MAX_SAFE_INTEGER),item('b',undefined,1)];
  const result=summarizeGiftSet(overflow,100); assert.equal(result.valid,false); assert.equal(result.subtotal,null); assert.equal(result.remaining,null);
});
test('helpers do not mutate entries or copy merchant assets', () => {
  const entries=[item()]; const before=structuredClone(entries);
  const freeze=o => { if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);} }; freeze(entries);
  const result=summarizeGiftSet(entries,100); canAddToGiftSet(entries,item('b'),100);
  assert.deepEqual(entries,before); assert.equal(result.groups[0].items[0].product,entries[0].product); assert.equal(result.groups[0].items[0].variant.url,entries[0].variant.url);
});
test('legitimate optionless products accept omitted response option arrays only for an explicit empty request', () => {
  for (const productOptions of [undefined,[]]) {
    for (const returnedSelected of [undefined,[]]) {
      for (const variantOptions of [undefined,[]]) {
        const entry=item(); entry.selected=[]; entry.product.options=productOptions; entry.product.selected=returnedSelected; entry.variant.options=variantOptions;
        assert.equal(summarizeGiftSet([entry],100).valid,true);
        entry.selected=undefined; assert.equal(summarizeGiftSet([entry],100).valid,false);
      }
    }
  }
});
test('empty requests cannot bypass known named or malformed option data', () => {
  const optionless=() => {const entry=item(); entry.selected=[]; delete entry.product.selected; delete entry.variant.options; return entry;};
  const cases=[
    entry => {entry.product.options=[{name:'Color',values:[{label:'Blue'}]}];},
    entry => {entry.variant.options=[{name:'Color',label:'Blue'}];},
    entry => {entry.product.selected=[{name:'Color',label:'Blue'}];},
    entry => {entry.product.variants.push({options:[{name:'Size',label:'Large'}]});},
    entry => {entry.product.options={};},
    entry => {entry.product.selected=null;},
    entry => {entry.variant.options=null;},
    entry => {entry.product.variants={};},
  ];
  for(const change of cases){const entry=optionless();change(entry);assert.equal(summarizeGiftSet([entry],100).valid,false);}
  const explicit=optionless(); explicit.product.selected=[]; explicit.variant.options=[]; explicit.product.options=[{name:'Color',values:[{label:'Blue'}]}];
  assert.equal(summarizeGiftSet([explicit],100).valid,false);
});

test('over-budget candidates may be added locally but checkout remains invalid until adjusted',()=>{const entries=[item('a',undefined,5000)],candidate=item('b',undefined,5399);assert.equal(canAddToGiftSet(entries,candidate,100).allowed,true);const summary=summarizeGiftSet([...entries,candidate],100);assert.equal(summary.subtotal,10399);assert.equal(summary.remaining,-399);assert.equal(summary.overBudget,true);assert.equal(summary.valid,false);assert.equal(summarizeGiftSet([...entries,candidate],103.99).valid,true);});
