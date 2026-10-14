import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CUSTOM_PRODUCTS,CUSTOM_MOTIFS,customSelection,customBrief} from '../src/custom-concepts.mjs';

test('five product types and four motifs use only verified source pack previews',async()=>{
  const provenance=JSON.parse(await readFile(new URL('../docs/asset-provenance.json',import.meta.url)));
  const verified=new Set(provenance.assets.map(a=>a.file.replace('public','')));
  assert.equal(CUSTOM_PRODUCTS.length,5);assert.equal(CUSTOM_MOTIFS.length,4);
  for(const item of [...CUSTOM_PRODUCTS,...CUSTOM_MOTIFS])assert.ok(verified.has(item.reference.image));
  let existing=0,unrendered=0;
  for(const p of CUSTOM_PRODUCTS)for(const m of CUSTOM_MOTIFS){const selection=customSelection(p.id,m.id);if(selection.prototype){existing++;assert.equal(selection.prototype.category,p.id);assert.equal(selection.prototype.theme,m.id);}else{unrendered++;assert.equal(selection.status,'Concept not rendered');}}
  assert.equal(existing,8);assert.equal(unrendered,12);assert.equal(customSelection('unknown','ocean'),null);
});
test('brief carries every current preference, including self gift and exclusions',()=>{
  const brief=customBrief({relationship:'Myself',recipient:'Old recipient',occasion:'Birthday',budget:85,likes:'Blue waves',dislikes:'Silk',arrivalDeadline:'2026-11-01',excludedFactors:['fragrance','animal-materials']},customSelection('tote','ocean'));
  for(const value of ['Recipient: You','Myself','Birthday','85 USD','Blue waves','Silk','2026-11-01','fragrance, animal-materials','Tote','Ocean Reverie','Concept not rendered','No automatic brief transfer'])assert.ok(brief.includes(value),value);
  assert.ok(!brief.includes('Old recipient'));
});
test('panel is responsive-ready, accessible, local and reuses current context on selection',async()=>{
  const source=await readFile(new URL('../public/custom-panel.mjs',import.meta.url),'utf8');
  assert.match(source,/custom-product-select/);assert.match(source,/custom-motif-grid/);assert.match(source,/aria-pressed/);assert.match(source,/aria-live/);
  assert.ok((source.match(/getProfile\(\)/g)||[]).length>=2);
  assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|innerHTML|URLSearchParams/);
  assert.doesNotMatch(source,/node\('input'/);
});
test('clicking a combination prepares fresh form details without additional fields',async()=>{
  class Element{
    constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attributes={};this.listeners={};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=[...children];}
    setAttribute(name,value){this.attributes[name]=value;}
    addEventListener(name,fn){this.listeners[name]=fn;}
  }
  const doc={createElement:tag=>new Element(tag,doc)};
  const host=new Element('div',doc);
  const source=(await readFile(new URL('../public/custom-panel.mjs',import.meta.url),'utf8')).replace("'/modules/custom-concepts.mjs'",JSON.stringify(new URL('../src/custom-concepts.mjs',import.meta.url).href));
  const {initCustomPanel}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  let profile={relationship:'Friend',recipient:'Alex',likes:'Plants',budget:30},brief;
  const panel=initCustomPanel({host,getProfile:()=>profile,onCopyBrief:value=>{brief=value;}});
  const all=(root)=>[root,...root.children.flatMap(all)];
  const byLabel=label=>all(host).find(e=>e.attributes['aria-label']===label);
  const select=byLabel('Product type');assert.equal(select.children.length,5);select.value='tote';select.listeners.change();byLabel('Ocean Reverie, shown on pillow').listeners.click();
  assert.equal(panel.getSelection().prototype,null);assert.ok(all(host).some(e=>e.textContent==='Tote × Ocean Reverie'));assert.equal(all(host).filter(e=>e.tagName==='a').length,0);assert.equal(all(host).filter(e=>e.className==='button primary').length,0);
  profile={relationship:'Myself',recipient:'You',likes:'Updated ocean preference',budget:50,dislikes:'silk',excludedFactors:['fragrance']};
  all(host).find(e=>e.textContent==='View design brief').listeners.click();
  assert.match(brief,/Updated ocean preference/);assert.match(brief,/Recipient: You/);assert.match(brief,/50 USD/);assert.match(brief,/fragrance/);
  assert.equal(all(host).filter(e=>e.tagName==='input').length,0);
});
