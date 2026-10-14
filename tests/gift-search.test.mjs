import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGiftSearchQuery, buildGiftSearchPlan } from '../src/gift-search.mjs';
import { audienceSearchQuery } from '../src/audience-context.mjs';

test('keeps named themes and short safe quoted interest phrases', () => {
  assert.match(buildGiftSearchQuery({likes:'They love Star Wars.'}), /Star Wars/);
  assert.deepEqual(buildGiftSearchPlan({likes:'They enjoy “Japanese ceramics” and "quiet mornings".'}).queries, ['Japanese ceramics gifts','quiet mornings gifts']);
  assert.equal(buildGiftSearchQuery({likes:'They like Star Wars and space.'}), 'Star Wars');
});

test('does not pass names, raw preferences or other private profile fields', () => {
  const query = buildGiftSearchQuery({recipient:'Alice Example', likes:'Alice Example loves Star Wars and gardening. Her address is 22 Private Street; her email is alice@example.com.', relationship:'Private relationship', occasion:'Private occasion', expression:'Private expression', email:'private@example.com'});
  assert.equal(query,'Star Wars');
  assert.doesNotMatch(query,/Alice|Example|Private|22|@|loves/);
  assert.equal(buildGiftSearchQuery({recipient:'Rose', likes:'Rose enjoys gardening and "Rose".'}), 'gardening gifts');
  assert.equal(buildGiftSearchQuery({likes:'They mentioned "HIV positive" and "22 Private Street".'}), 'meaningful gifts');
});

test('giver and negative evidence cannot become recipient search terms', () => {
  assert.equal(buildGiftSearchQuery({likes:'I love Star Wars but they enjoy gardening.'}), 'gardening gifts');
  assert.equal(buildGiftSearchQuery({likes:'They love coffee but hate gardening.'}), 'coffee gifts');
  assert.equal(buildGiftSearchQuery({likes:'They like coffee and gardening.',dislikes:'coffee'}), 'gardening gifts');
  assert.equal(buildGiftSearchQuery({likes:'They hate Star Wars and coffee.'}), 'meaningful gifts');
  assert.equal(buildGiftSearchQuery({likes:'I love Star Wars.',selfGift:true}), 'Star Wars');
});

test('birthday, thanks and emotional meaning never become a card or literal expression search', () => {
  for (const occasion of ['Birthday','Thank you','New beginnings']) {
    const query=buildGiftSearchQuery({likes:'They enjoy reading.',occasion,expression:'protection courage companionship new beginnings'});
    assert.equal(query,'reading gifts');
    assert.doesNotMatch(query,/birthday|thank|card|protection|courage|companionship|beginnings/i);
  }
  assert.equal(buildGiftSearchQuery({likes:'',occasion:'Birthday',expression:'courage and protection'}),'meaningful gifts');
});

test('optional audience is applied once by caller; explicit positive generic mentions survive inference', () => {
  assert.equal(buildGiftSearchQuery({likes:'A man who loves Star Wars.'}),'Star Wars');
  const base=buildGiftSearchQuery({likes:'A man who loves Star Wars.',audience:'men',ageBand:'30-44'});
  assert.equal(base,'Star Wars');
  assert.equal(buildGiftSearchPlan({likes:'A man who loves Star Wars.',audience:'men',ageBand:'30-44'}).hasTheme,true);
  assert.equal(audienceSearchQuery('gardening gifts',{audience:'men',ageBand:'30-44'}),"gardening gifts men's adult");
  assert.equal(buildGiftSearchQuery({likes:'I am a man. They like gardening.'}),'gardening gifts');
});

test('always bounded, deterministic and pure with missing/long inputs', () => {
  assert.equal(buildGiftSearchQuery(),'meaningful gifts');
  assert.equal(buildGiftSearchQuery(null),'meaningful gifts');
  const profile=Object.freeze({likes:'Star Wars gardening travel photography woodworking ceramics cooking hiking coffee books music '.repeat(30)});
  const query=buildGiftSearchQuery(profile);
  assert.ok(query.length<=240);
  assert.equal(query,buildGiftSearchQuery(profile));
});


test('named theme is the exact first query, never ANDed with secondary interests or demographics', () => {
  const profile={likes:'They love Star Wars, coffee, hosting and gardening.',audience:'men',ageBand:'45-64'};
  assert.deepEqual(buildGiftSearchPlan(profile),{queries:['Star Wars'],hasTheme:true});
  assert.equal(buildGiftSearchQuery(profile),'Star Wars');
  assert.equal(buildGiftSearchQuery({likes:'他喜欢星球大战，还有咖啡'}),'Star Wars');
  assert.equal(buildGiftSearchQuery({likes:'They enjoy StarWars and coffee.'}),'Star Wars');
  const plan=buildGiftSearchPlan({likes:'They love coffee, hosting and gardening.'});
  assert.equal(plan.hasTheme,false);
  assert.equal(plan.queries.length,3);
  assert.ok(plan.queries.every(query=>['coffee','hosting','gardening'].filter(term=>query.includes(term)).length===1));
});

test('explicit card product intent is prioritized but occasion/expression do not manufacture it', () => {
  assert.equal(buildGiftSearchQuery({likes:'They enjoy gardening and greeting cards.'}),'greeting cards gifts');
  assert.equal(buildGiftSearchQuery({likes:'They collect birthday cards.'}),'birthday cards gifts');
  assert.equal(buildGiftSearchQuery({likes:'They play card games.'}),'meaningful gifts');
  assert.equal(buildGiftSearchQuery({likes:'They enjoy gardening.',occasion:'Birthday',expression:'Send a greeting card'}),'gardening gifts');
  assert.equal(buildGiftSearchQuery({likes:'They love Star Wars and greeting cards.'}),'Star Wars');
});


test('novel ordinary interests remain separate focused queries rather than dictionary fallback', () => {
  assert.deepEqual(buildGiftSearchPlan({likes:'They love mechanical keyboards, kintsugi pottery, and fountain pens.'}), {
    queries:['mechanical keyboards gifts','kintsugi pottery gifts','fountain pens gifts'],hasTheme:false,
  });
  assert.equal(buildGiftSearchQuery({likes:'They love “mechanical keyboards”.'}),'mechanical keyboards gifts');
  assert.equal(buildGiftSearchQuery({likes:'They love Moomin.'}),'Moomin');
  assert.equal(buildGiftSearchQuery({likes:'They enjoy "Totoro".'}),'Totoro');
  assert.equal(buildGiftSearchQuery({likes:'They love mechanical keyboards and Star Wars.'}),'Star Wars');
});

test('novel phrase path rejects identity, contact, biography and health details', () => {
  for (const likes of ['They love "Alice Smith".', 'They love "alice@example.com".',
    'They love "22 Private Street".', 'They love "diabetes treatment".',
    'They love "my private account".', 'They live at Private Street.',
    'They love mechanical keyboards because she lives in London.']) {
    const query=buildGiftSearchQuery({likes});
    assert.doesNotMatch(query,/Alice|Smith|example|Private|22|diabetes|account|London|because/i, likes);
  }
  assert.equal(buildGiftSearchQuery({recipient:'Alice Smith',likes:'They love "alice smith".'}),'meaningful gifts');
  assert.equal(buildGiftSearchQuery({likes:'I love mechanical keyboards. They enjoy fountain pens.'}),'fountain pens gifts');
  assert.equal(buildGiftSearchQuery({likes:'They love fountain pens but dislike mechanical keyboards.'}),'fountain pens gifts');
});

test('independent adjacent interests split without breaking named entities or useful compounds',()=>{
 for(const [likes,queries]of [['hiking movie',['hiking gifts','movie gifts']],['coffee gardening',['coffee gifts','gardening gifts']],['rock climbing movies',['rock climbing gifts','movies gifts']],['photography travel',['photography gifts','travel gifts']],['They enjoy mechanical keyboards and movies.',['mechanical keyboards gifts','movies gifts']]])assert.deepEqual(buildGiftSearchPlan({likes}),{queries,hasTheme:false});
 for(const [likes,query]of [['hiking boots','hiking boots gifts'],['home decor','home decor gifts'],['coffee brewing','coffee brewing gifts'],['mechanical keyboards','mechanical keyboards gifts'],['Star Wars','Star Wars'],['Harry Potter','Harry Potter']])assert.equal(buildGiftSearchQuery({likes}),query);
 assert.deepEqual(buildGiftSearchPlan({likes:'They enjoy hiking but dislike movies.'}).queries,['hiking gifts']);assert.deepEqual(buildGiftSearchPlan({likes:'I enjoy movies. They like hiking.'}).queries,['hiking gifts']);assert.ok(buildGiftSearchPlan({likes:'hiking movie coffee gardening photography'}).queries.length<=3);
});
