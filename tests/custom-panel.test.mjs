import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {relevantCustomConcepts} from '../src/custom-concepts.mjs';
async function setup(profile){
 class Element{constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attributes={};this.listeners={};}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=[...children];}setAttribute(name,value){this.attributes[name]=value;}addEventListener(name,fn){this.listeners[name]=fn;}}
 const doc={createElement:tag=>new Element(tag,doc)},host=new Element('div',doc);
 const source=(await readFile(new URL('../public/custom-panel.mjs',import.meta.url),'utf8')).replace("'/modules/custom-concepts.mjs'",JSON.stringify(new URL('../src/custom-concepts.mjs',import.meta.url).href));
 const {initCustomPanel}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 let brief;const panel=initCustomPanel({host,getProfile:()=>profile,onCopyBrief:value=>brief=value});const all=root=>[root,...root.children.flatMap(all)];
 return {panel,all:()=>all(host),brief:()=>brief,click:label=>{const e=all(host).find(e=>e.attributes['aria-label']===label||e.textContent===label);assert.ok(e,label);e.listeners.click();}};
}
test('no product selector, no default selection, only relevant patterns then exact product cards',async()=>{
 const profile={likes:'They love ocean waves',recipient:'Alex',expression:''};const ui=await setup(profile);
 assert.equal(ui.panel.getSelection(),null);assert.equal(ui.all().filter(e=>e.tagName==='select'||e.tagName==='input').length,0);
 assert.ok(!ui.all().some(e=>e.attributes['aria-label']==='Pattern: Moonlit Botanica'));
 assert.equal(ui.all().filter(e=>e.tagName==='img').length,1);assert.equal(ui.all().find(e=>e.tagName==='img').src,'/assets/ocean-reverie-original-pattern.png','Actual original artwork, not a pillow crop');
 ui.click('Pattern: Ocean Reverie');assert.equal(ui.all().filter(e=>e.tagName==='img').length,3);
 ui.click('Ocean Reverie · Decorative Pillow');assert.equal(ui.panel.getSelection().prototype.id,'ocean-pillow');
 ui.panel.refresh();assert.equal(ui.panel.getSelection().prototype.id,'ocean-pillow');
 ui.click('View design brief');assert.match(ui.brief(),/Alex/);
 profile.likes='They love gardens';ui.panel.refresh();assert.equal(ui.panel.getSelection(),null);
 assert.ok(!ui.all().some(e=>e.attributes['aria-label']==='Pattern: Ocean Reverie'));
});
test('franchise-only interest produces honest no-match; browsing is explicit exploration',async()=>{
 const ui=await setup({likes:'Star Wars',expression:'courage'});
 assert.equal(ui.all().filter(e=>e.tagName==='img').length,0);
 assert.ok(ui.all().some(e=>e.textContent?.includes('No original design match')));
 ui.click('Browse all original concepts');assert.equal(ui.all().filter(e=>e.attributes['aria-label']?.startsWith('Pattern:')).length,4);
 assert.ok(ui.all().some(e=>e.textContent?.includes('not personalized matches')));
});
test('all exposed product images are verified and module has no network or storage',async()=>{
 const provenance=JSON.parse(await readFile(new URL('../docs/asset-provenance.json',import.meta.url)));const verified=new Set(provenance.assets.map(a=>a.file.replace('public','')));
 const cards=relevantCustomConcepts({}, {browseAll:true}).cards;assert.equal(cards.length,8);for(const card of cards)assert.ok(verified.has(card.prototype.image));
 const source=await readFile(new URL('../public/custom-panel.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|innerHTML|URLSearchParams|node\('select'/);
});
