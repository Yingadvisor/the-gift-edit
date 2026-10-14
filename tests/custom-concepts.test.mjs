import test from 'node:test';
import assert from 'node:assert/strict';
import {rankCustomMotifs,customBrief,customSelection,relevantCustomConcepts} from '../src/custom-concepts.mjs';
test('expression suggestions are deterministic, preserving original meanings as interpretations',()=>{
 for(const [text,id] of [['protection','ocean'],['勇气','geometric'],['enduring companionship','celestial'],['新的开始','botanical']]){assert.equal(rankCustomMotifs(text)[0].id,id);assert.match(rankCustomMotifs(text)[0].interpretation,/in this design/);}
 const brief=customBrief({expression:'愿你有勇气',style:'minimalist',lifestyle:'office'},customSelection('tote','geometric'));assert.match(brief,/愿你有勇气/);assert.match(brief,/Style: minimalist/);assert.match(brief,/Lifestyle: office/);assert.match(brief,/not a universal cultural meaning/);
});
test('positive relevance gates original concepts with no default unrelated themes',()=>{
 assert.equal(relevantCustomConcepts({}).cards.length,0);
 assert.equal(relevantCustomConcepts({likes:'coffee'}).cards.length,0);
 assert.deepEqual([...new Set(relevantCustomConcepts({likes:'They love ocean walks'}).cards.map(c=>c.prototype.theme))],['ocean']);
 assert.deepEqual([...new Set(relevantCustomConcepts({expression:'courage'}).cards.map(c=>c.prototype.theme))],['geometric']);
 assert.equal(relevantCustomConcepts({likes:'Star Wars',expression:'enduring companionship'}).cards.length,0);
 assert.equal(relevantCustomConcepts({likes:'I love ocean'}).cards.length,0);
 assert.equal(relevantCustomConcepts({likes:'I love ocean',relationship:'Myself'}).cards.length,2);
});
test('explicit avoidances and category exclusions apply even while exploring',()=>{
 assert.equal(relevantCustomConcepts({likes:'ocean',dislikes:'pillows'}).cards.length,1);
 assert.equal(relevantCustomConcepts({likes:'no ocean'}).cards.length,0);
 assert.equal(relevantCustomConcepts({dislikes:'silk'}, {browseAll:true}).cards.length,7);
 assert.ok(relevantCustomConcepts({dislikes:'flowers'}, {browseAll:true}).cards.every(c=>!c.prototype.motifs.includes('flowers')));
 assert.ok(relevantCustomConcepts({excludedCategories:['pillow']},{browseAll:true}).cards.every(c=>c.prototype.category!=='pillow'));
 assert.ok(relevantCustomConcepts({likes:'ocean',excludedFactors:['fragrance']}).cards.every(c=>c.unknownFactors.some(f=>f.id==='fragrance')));
});
