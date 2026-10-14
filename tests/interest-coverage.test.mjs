import test from 'node:test';import assert from 'node:assert/strict';
import {interestQueries,interestMatches,balanceInterestCandidates} from '../src/interest-coverage.mjs';
const p=(id,title)=>({id,title,variants:[{id:`variant-${id}`} ]});
test('coverage recognizes supported independent groups, preserves compounds, and never infers absent interests',()=>{
 const queries=interestQueries({likes:'hiking movie'});assert.deepEqual(queries,['hiking gifts','movie gifts']);assert.deepEqual(interestMatches(p('1','Cinema film mug'),{},queries),[1]);assert.deepEqual(interestMatches(p('2','Trail hiking bottle'),{},queries),[0]);assert.deepEqual(interestMatches(p('3','Plain necklace'),{},queries),[]);
 assert.deepEqual(interestMatches(p('4','Mechanical watch'),{},['mechanical keyboards gifts']),[]);assert.deepEqual(interestMatches(p('5','Mechanical keyboard kit'),{},['mechanical keyboards gifts']),[0]);assert.deepEqual(interestQueries({likes:'Star Wars'}),[]);assert.deepEqual(interestQueries({likes:'Harry Potter'}),[]);
});
test('coverage round-robins actual evidence without mutation, duplicates, or synthetic filler',()=>{
 const items=[...Array.from({length:12},(_,i)=>p(`h${i}`,'Hiking mug')),p('m1','Movie cinema mug'),p('m2','Movie poster')];const before=structuredClone(items);const result=balanceInterestCandidates(items,['hiking gifts','movie gifts'],{limit:5});assert.equal(result.length,5);assert.deepEqual(result.slice(0,4).map(x=>x.id),['h0','m1','h1','m2']);assert.deepEqual(items,before);assert.ok(result.every(x=>items.includes(x)));assert.deepEqual(balanceInterestCandidates([],['hiking','movie']),[]);
});
