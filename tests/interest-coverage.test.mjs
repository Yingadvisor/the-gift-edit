import test from 'node:test';import assert from 'node:assert/strict';
import {interestQueries,interestMatches,balanceInterestCandidates,supportsPrimaryInterest} from '../src/interest-coverage.mjs';
const p=(id,title)=>({id,title,variants:[{id:`variant-${id}`} ]});
test('coverage recognizes supported independent groups, preserves compounds, and never infers absent interests',()=>{
 const queries=interestQueries({likes:'hiking movie'});assert.deepEqual(queries,['hiking gifts','movie gifts']);assert.deepEqual(interestMatches(p('1','Cinema film mug'),{},queries),[1]);assert.deepEqual(interestMatches(p('2','Trail hiking bottle'),{},queries),[0]);assert.deepEqual(interestMatches(p('3','Plain necklace'),{},queries),[]);
 assert.deepEqual(interestMatches(p('4','Mechanical watch'),{},['mechanical keyboards gifts']),[]);assert.deepEqual(interestMatches(p('5','Mechanical keyboard kit'),{},['mechanical keyboards gifts']),[0]);assert.deepEqual(interestQueries({likes:'Star Wars'}),[]);assert.deepEqual(interestQueries({likes:'Harry Potter'}),[]);
});
test('coverage round-robins actual evidence without mutation, duplicates, or synthetic filler',()=>{
 const items=[...Array.from({length:12},(_,i)=>p(`h${i}`,'Hiking mug')),p('m1','Movie cinema mug'),p('m2','Movie poster')];const before=structuredClone(items);const result=balanceInterestCandidates(items,['hiking gifts','movie gifts'],{limit:5});assert.equal(result.length,5);assert.deepEqual(result.slice(0,4).map(x=>x.id),['h0','m1','h1','m2']);assert.deepEqual(items,before);assert.ok(result.every(x=>items.includes(x)));assert.deepEqual(balanceInterestCandidates([],['hiking','movie']),[]);
});

test('activity phrases retain ocean, shell and hosting evidence without requiring incidental verbs',()=>{const profile={likes:'They love ocean walks, collecting shells, and hosting friends for dinner.'};const queries=interestQueries(profile);assert.deepEqual(interestMatches(p('o','Ocean turtle bracelet'),{},queries),[0]);assert.deepEqual(interestMatches(p('s','Seashell display box'),{},queries),[1]);assert.deepEqual(interestMatches(p('h','Ceramic dinnerware'),{},queries),[2]);assert.equal(supportsPrimaryInterest(p('bad','Plain necklace'),{},profile),false);assert.equal(supportsPrimaryInterest(p('m','Ceramic mug'),{},{likes:'They like useful objects for slow mornings.'}),true);});

test('primary interest preserves established ocean and shell aliases',()=>{assert.equal(supportsPrimaryInterest(p('w','Wave bowl'),{},{likes:'ocean'}),true);assert.equal(supportsPrimaryInterest(p('n','Nautilus figurine'),{},{likes:'collecting shells'}),true);assert.equal(supportsPrimaryInterest(p('f','Floral mug'),{},{likes:'flowers'}),true);});
