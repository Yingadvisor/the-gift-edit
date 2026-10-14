import test from 'node:test';
import assert from 'node:assert/strict';
import { EXCLUSION_FACTORS, assessExclusions } from '../src/exclusion-factors.mjs';
const ids = EXCLUSION_FACTORS.map(f => f.id);
const assess = (product, id, variant = {}) => assessExclusions(product, variant, [id]);
const matched = (product, id, variant) => assess(product, id, variant).matches.length > 0;

test('stable factors, selection only, deduplication and missing-data uncertainty', () => {
  assert.deepEqual(ids, ['clothes-shoes', 'food-alcohol', 'fragrance', 'sizing', 'bulky', 'high-maintenance']);
  assert.deepEqual(assessExclusions(null, null, ids), { matches: [], unknown: EXCLUSION_FACTORS });
  assert.deepEqual(assessExclusions({title:'Perfume'}, {}, []), {matches:[], unknown:[]});
  assert.equal(assessExclusions({title:'Perfume'}, {}, ['fragrance','fragrance','fake']).matches.length, 1);
});

test('fragrance needs scent evidence and respects explicit negative claims', () => {
  for (const title of ['Candle', 'Soap dish', 'Lavender print', 'Essential oil storage box']) {
    assert.equal(matched({title}, 'fragrance'), false, title);
    assert.equal(assess({title}, 'fragrance').unknown.length, 1);
  }
  for (const title of ['Scented candle', 'Perfume', 'Aromatherapy diffuser']) assert.equal(matched({title}, 'fragrance'), true, title);
  for (const title of ['Scent-free gift', 'Fragrance-free candle', 'Unscented candle', 'No added fragrance', 'Not a scented candle']) {
    assert.equal(matched({title}, 'fragrance'), false, title);
  }
  assert.equal(assess({title:'Scent-free gift'}, 'fragrance').unknown.length, 0);
  assert.equal(matched({title:'Candle'}, 'fragrance', {options:[{name:'Scent', label:'Vanilla'}]}),true);
  assert.equal(matched({title:'Candle'}, 'fragrance', {options:[{name:'Scent', label:'None'}]}),false);
  const details = {title:'Candle', metadata:{tech_specs:['Scent: vanilla']}};
  assert.match(assess(details, 'fragrance').matches[0].evidence, /product.metadata.tech_specs\[0\].*Scent: vanilla/);
  assert.equal(matched({title:'Candle', description:'No flame. Scented with rose.'}, 'fragrance'), true);
  assert.equal(matched({title:'Scent-free candle',description:'Includes a scented sachet.'}, 'fragrance'), true);
});

test('clothes and food require item evidence rather than keyword accessories', () => {
  for (const title of ['Cotton shirt','Leather shoes','Wool socks']) assert.equal(matched({title}, 'clothes-shoes'), true);
  for (const title of ['Shoe rack','Coat hanger','Shirt pattern','Not clothing']) assert.equal(matched({title}, 'clothes-shoes'), false, title);
  for (const title of ['Wine glass','Coffee mug','Tea infuser','Chocolate scented candle','Cookie jar', 'Wine accessories']) assert.equal(matched({title}, 'food-alcohol'), false, title);
  for (const title of ['Red wine','Box of chocolates','Loose leaf tea','Coffee beans']) assert.equal(matched({title}, 'food-alcohol'), true, title);
  assert.equal(matched({title:'Sampler',category:{name:'Food'}},'food-alcohol'),true);
  assert.equal(matched({title:'Gift',description:{plain:'This is a cotton shirt.'}},'clothes-shoes'),true);
});

test('size options need apparel/body fit and generic sizes remain unknown', () => {
  const variant = {options:[{name:'Size',label:'M'}]};
  assert.equal(matched({title:'Wool sweater'},'sizing',variant),true);
  assert.equal(matched({title:'Ring'},'sizing',{options:[{name:'Ring size',label:'7'}]}),true);
  assert.equal(matched({title:'Bowl'},'sizing',variant),false);
  assert.equal(assess({title:'Bowl'},'sizing',variant).unknown.length,1);
  assert.equal(matched({title:'Sweater'},'sizing'),false);
  assert.equal(assess({title:'Scarf',description:'One size fits all'},'sizing',variant).unknown.length,0);
});

test('bulky uses explicit furniture evidence or documented unit thresholds', () => {
  for (const description of ['Dimensions: 120 x 30 x 20 cm','Width: 100 cm','Weight: 10 kg','Weight: 25 lbs','Height: 1.2 m']) {
    const result=assess({title:'Gift',description},'bulky');
    assert.equal(result.matches.length,1,description);
    assert.match(result.matches[0].evidence,/threshold/);
  }
  assert.equal(matched({title:'Large sofa'},'bulky'),true);
  for (const description of ['Width: 99 cm','Weight: 9.9 kg','100 cm ribbon','Weight: 100 g','Width: 100','Not heavy furniture','Weight is not 20 kg']) {
    assert.equal(matched({title:'Gift',description},'bulky'),false,description);
  }
  assert.equal(matched({title:'Gift',metadata:{width:'120 cm'}},'bulky'),true);
  assert.equal(assess({title:'Compact and lightweight'},'bulky').unknown.length,0);
});

test('upkeep must be explicit, not assumed from botanical imagery or plants', () => {
  for (const description of ['Requires daily watering','Hand-wash only','Dry-clean only','Needs frequent misting']) assert.equal(matched({title:'Gift',description},'high-maintenance'),true,description);
  for (const title of ['Live plant','Botanical print','Artificial plant','Low-maintenance gift']) assert.equal(matched({title},'high-maintenance'),false,title);
  assert.equal(matched({title:'Live plant',description:'Does not require daily watering.'},'high-maintenance'),false);
  assert.equal(assess({title:'Low-maintenance gift'},'high-maintenance').unknown.length,0);
});


test('concrete hoodie size options outrank an included one-size scarf', () => {
  const product = {title:'Ocean hoodie', description:'Includes a one-size scarf.', options:[{name:'Size',values:[{label:'S'},{label:'M'}]}]};
  const result = assess(product, 'sizing', {options:[{name:'Size',label:'M'}]});
  assert.equal(result.matches.length, 1);
  assert.equal(result.unknown.length, 0);
  assert.match(result.matches[0].evidence, /options.*Ocean hoodie/);
  assert.equal(matched(product, 'sizing'), true);
  assert.equal(matched({title:'Bowl', options:product.options}, 'sizing'), false);
  assert.equal(matched({title:'Hoodie', options:[{name:'Size'}]}, 'sizing'), false);
  assert.equal(matched({title:'Hoodie', options:[{name:'Size',label:'One size'}]}, 'sizing'), false);
});

test('common gift foods match without misclassifying food-themed accessories', () => {
  for (const title of ['Sea salt gift set','Raw honey','Hot sauce','Sauces','Dried tea','Condiments']) {
    assert.equal(matched({title}, 'food-alcohol'), true, title);
  }
  for (const title of ['Wine glass','Coffee mug','Chocolate candle','Sea salt soap','Honey pot','Honey candle','Sauce dish']) {
    const result = assess({title}, 'food-alcohol');
    assert.equal(result.matches.length, 0, title);
    assert.equal(result.unknown.length, 1, title);
  }
});
