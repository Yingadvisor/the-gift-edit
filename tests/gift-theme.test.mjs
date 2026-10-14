import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredThemePhrases,assessTheme,themeSearchQuery} from '../src/gift-theme.mjs';
test('literal named and quoted themes are required without inferring licenses',()=>{
 assert.deepEqual(requiredThemePhrases('star wars "coffee club" gifts'),['Star Wars','coffee club']);
 assert.equal(assessTheme({title:'Generic silver necklace'},{},'Star Wars').eligible,false);
 assert.equal(assessTheme({title:'Star Wars necklace'},{},'Star Wars').eligible,true);
 assert.equal(assessTheme({title:'Star Wars necklace'},{},'Star Wars "coffee club"').eligible,false);
 assert.equal(assessTheme({metadata:{theme:'Star Wars'}},{},'star wars').eligible,true);
 assert.equal(assessTheme({url:'https://example.com/star-wars',media:[{alt:'Star Wars'}]},{},'Star Wars').eligible,false);
 assert.match(assessTheme({title:'Star Wars necklace'},{},'Star Wars').reason,/not verified/);
});
test('search preserves original theme and query despite model drift, within limit',()=>{
 const query=themeSearchQuery('silver jewelry','Star Wars gifts');assert.match(query,/Star Wars/);assert.equal(query,'Star Wars jewelry');
 const long=themeSearchQuery('x'.repeat(240),'Star Wars '+ 'gift '.repeat(40));assert.ok(long.length<=240);assert.match(long,/^Star Wars/);
 assert.equal(assessTheme({title:'coffee mug'},{},'useful coffee gifts').eligible,true);
});
test('explicit theme denials are not positive merchant evidence',()=>{
 for(const description of ['This is not a Star Wars product.','No Star Wars branding.','Unrelated to Star Wars.','Star Wars is not included.','This is not a "Star Wars" product.'])assert.equal(assessTheme({title:'Plain space mug',description},{},'Star Wars').eligible,false,description);
 assert.equal(assessTheme({title:'Star Wars mug',description:'Not dishwasher safe.'},{},'Star Wars').eligible,true);
 assert.equal(assessTheme({title:'Star Wars mug',description:'This is not a Star Wars collectible.'},{},'Star Wars').eligible,true);
 assert.equal(assessTheme({title:'Space mug',description:'Not for toddlers. Star Wars design.'},{},'Star Wars').eligible,true);
 assert.equal(assessTheme({title:'Space mug',description:'No coffee theme, but Star Wars design.'},{},'Star Wars').eligible,true);
});
test('known named themes stay intact without duplicated original-profile queries',()=>{
 for(const theme of ['Star Trek','Harry Potter','The Lord of the Rings','Studio Ghibli','Hello Kitty','Pokémon','Minecraft','Super Mario','Animal Crossing','Dungeons & Dragons','LEGO','Marvel'])assert.deepEqual(requiredThemePhrases(`${theme} coffee birthday gifts`),[theme]);
 assert.equal(themeSearchQuery('birthday coffee gardening necklaces for men','Star Wars coffee gardening gifts'),'Star Wars necklaces');
});
