import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIENCES, AGE_BANDS, validateAudienceContext, audienceSearchQuery, classifyProductAudience, assessAudience } from '../src/audience-context.mjs';
const men = { audience: 'men', ageBand: '30-44' };
const check = (product, context = men, variant) => assessAudience(product, variant, context);

test('strict optional adult-only context with no identity or arbitrary fields', () => {
  assert.deepEqual(AUDIENCES, ['any', 'men', 'women', 'unisex']);
  assert.deepEqual(AGE_BANDS, ['any', '18-29', '30-44', '45-64', '65+']);
  assert.equal(validateAudienceContext().audience, 'any');
  for (const bad of [null, [], 'men', { audience:'male' }, { audience:3 }, {ageBand:'under18'}, {ageBand:'13-17'}, {ageBand:25}, {age:25}, {name:'Sam'}, {ageBand:'18-29',email:'a@example.com'}]) assert.throws(() => validateAudienceContext(bad), TypeError);
  for (const ageBand of AGE_BANDS) assert.equal(validateAudienceContext({ageBand}).ageBand, ageBand);
  assert.throws(() => validateAudienceContext({}, 'x'.repeat(241)), TypeError);
});

test('query inference is bounded, generic and field priority is disclosed', () => {
  for (const query of ['gifts for men', 'gift for a man', 'male gift', '男人礼物', '男士项链']) {
    assert.equal(validateAudienceContext({}, query).audience, 'men');
    assert.equal(validateAudienceContext({}, query).audienceSource, 'query');
  }
  assert.equal(validateAudienceContext({}, 'gifts for women').audience, 'women');
  assert.equal(validateAudienceContext({}, 'womanhood celebration').audience, 'any');
  assert.equal(validateAudienceContext({}, 'gifts for men and women').audience, 'any');
  const selected = validateAudienceContext({audience:'men'}, 'necklace for women');
  assert.equal(selected.audience, 'men');
  assert.match(selected.notice, /priority/);
  assert.doesNotMatch(audienceSearchQuery('necklace for women', men), /women/);
  assert.match(audienceSearchQuery('necklace for women', men), /men's adult$/);
  const query = audienceSearchQuery('x'.repeat(240), men);
  assert.ok(query.length <= 240);
  assert.match(query, /men's adult$/);
  assert.doesNotMatch(query, /30-44/);
});

test("men's necklace is allowed; explicit women's merchandise is excluded, not all necklaces", () => {
  const necklace = check({title:"Men's silver necklace"});
  assert.equal(necklace.eligible, true);
  assert.equal(necklace.audience, 'men');
  assert.equal(necklace.audienceStatus, 'listing-evidence');
  assert.equal(check({title:"Women's silver necklace"}).eligible, false);
  assert.equal(check({title:'Necklace', metadata:{gender:'female'}}).eligible, false);
  assert.equal(check({title:'Necklace', metadata:{gender:'male'}}).eligible, true);
  assert.equal(check({title:'Necklace'}, {audience:'any'}, {title:"Women's style"}).eligible, true);
});

test('unknown audience stays eligible without male/style claims or category stereotypes', () => {
  for (const title of ['Necklace', 'Pink candle', 'Hammer', 'Silk scarf', 'Male connector adapter', 'Women-owned candle business', 'Men at Work book']) {
    const result = check({title});
    assert.equal(result.eligible, true, title);
    assert.equal(result.audience, 'unknown', title);
    assert.equal(result.status, 'unknown', title);
    assert.match(result.reason, /Can't verify audience/);
    assert.doesNotMatch(result.reason, /suitable for men|masculine|for males/i);
  }
  assert.equal(classifyProductAudience({title:'Candle',url:'https://shop.test/women',sku:'men'}).audience, 'unknown');
  assert.equal(classifyProductAudience({title:'Not for women. A sculpture.'}).audience, 'unknown');
  assert.equal(classifyProductAudience({description:'Handmade by women artisans.'}).audience, 'unknown');
  assert.equal(classifyProductAudience({category:{name:'Women'}}).audience, 'women');
});

test('explicit unisex is allowed for men/women; unisex selection rejects gender-specific merchandise', () => {
  for (const audience of ['men','women','unisex']) assert.equal(check({title:'Unisex necklace'},{audience}).eligible, true);
  assert.equal(check({title:"Men's necklace"},{audience:'unisex'}).eligible,false);
  assert.equal(check({title:"Women's necklace"},{audience:'unisex'}).eligible,false);
  const mixed = check({title:"Men's and women's styles"},{audience:'unisex'});
  assert.equal(mixed.eligible,true);
  assert.equal(mixed.audience,'mixed');
  assert.equal(mixed.status,'unknown');
});

test('adult bands remain soft unless explicit actual age evidence contradicts them', () => {
  assert.equal(check({title:'Puzzle'}).ageStatus,'unknown');
  assert.equal(check({title:'Puzzle',description:'Ages 18-99'}).eligible,true);
  assert.equal(check({title:'Puzzle',description:'Ages 65+'}).eligible,false);
  assert.equal(check({title:'Puzzle',description:'Ages 20-35'}).eligible,true);
  assert.equal(check({title:'Puzzle',metadata:{age_range:'65-99'}}).eligible,false);
  assert.equal(check({title:'Puzzle',description:'Dimensions: 3-12 inches'}).eligible,true);
  assert.equal(check({title:'Kids necklace'}).eligible,false);
  assert.equal(check({title:'Puzzle',description:'Designed for children'}).eligible,false);
  assert.equal(check({title:'Puzzle',description:'Ages 8–12'}).eligible,false);
  assert.equal(check({title:'Puzzle',metadata:{age_group:'kids'}}).eligible,false);
  assert.equal(check({title:'Candle',description:'Keep out of reach of children.'}).eligible,true);
  assert.equal(check({title:'Baby monitor'}).eligible,true);
});

test('pure helpers do not mutate input', () => {
  const context = Object.freeze({...men});
  const product = Object.freeze({title:"Men's necklace",metadata:Object.freeze({gender:'male'})});
  assert.doesNotThrow(() => assessAudience(product,undefined,context));
  assert.doesNotThrow(() => audienceSearchQuery('necklace',context));
  assert.deepEqual(context,men);
});


test('explicit mixed-age product use is not child-only; adult purchaser mentions do not override restrictions', () => {
  for (const description of [
    'A collectible for children and adults. Ages 8+',
    'A puzzle for both children and adults. Ages 8+',
    'A toy for adults and children. Ages 8+',
    'Designed for children and adults. Ages 8+',
    'Designed for children. Suitable for all ages. Ages 8+',
    'All-ages toy. Ages 8+',
  ]) assert.equal(check({title:'Collectible puzzle',description}).eligible,true,description);
  for (const product of [
    {title:'Kids necklace',description:'For children and adults. Ages 8+'},
    {title:'Puzzle',description:'For children and adults. Ages 8–12'},
    {title:'Puzzle',description:'For children only. Suitable for all ages.'},
    {title:'Puzzle',description:'Exclusively for children. For both children and adults.'},
    {title:'Puzzle',description:'For children. Adults can buy it as a gift. Ages 8+'},
    {title:'Puzzle',description:'For children under adult supervision. Ages 8+'},
    {title:'Puzzle',description:'For children. Not suitable for all ages. Ages 8+'},
  ]) assert.equal(check(product).eligible,false,JSON.stringify(product));
});
