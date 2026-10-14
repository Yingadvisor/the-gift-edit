import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rankCustomMotifs,customBrief,customSelection} from '../src/custom-concepts.mjs';

test('expression ranking is deterministic and limited to four original motifs',()=>{
  for(const [text,id] of [['protection','ocean'],['勇气','geometric'],['enduring companionship','celestial'],['新的开始','botanical']]){
    const result=rankCustomMotifs(text);assert.equal(result[0].id,id);assert.equal(result[0].matched,true);assert.equal(result.length,4);
    assert.match(result[0].interpretation,/in this design/);
    assert.deepEqual(result,rankCustomMotifs(text));
  }
  assert.ok(rankCustomMotifs('').every(item=>!item.matched));
  assert.ok(rankCustomMotifs('unmapped personal meaning').every(item=>!item.matched));
  assert.equal(rankCustomMotifs('protection and courage').filter(item=>item.matched).length,2);
});
test('brief preserves expression verbatim and qualifies proposed interpretation',()=>{
  const brief=customBrief({expression:'愿你有勇气开始新篇章'},customSelection('tote','geometric'));
  assert.match(brief,/What we want to express: 愿你有勇气开始新篇章/);
  assert.match(brief,/not a universal cultural meaning/);
});
test('ranking refresh preserves explicit product and motif selection and uses current expression',async()=>{
  class Element{
    constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attributes={};this.listeners={};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=[...children];}
    setAttribute(name,value){this.attributes[name]=value;}
    addEventListener(name,fn){this.listeners[name]=fn;}
  }
  const doc={createElement:tag=>new Element(tag,doc)},host=new Element('div',doc);
  const source=(await readFile(new URL('../public/custom-panel.mjs',import.meta.url),'utf8')).replace("'/modules/custom-concepts.mjs'",JSON.stringify(new URL('../src/custom-concepts.mjs',import.meta.url).href));
  assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|innerHTML|node\('input'/);
  const {initCustomPanel}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  let profile={expression:'protection'};
  const panel=initCustomPanel({host,getProfile:()=>profile});
  const all=root=>[root,...root.children.flatMap(all)];
  const byLabel=label=>all(host).find(e=>e.attributes['aria-label']===label);
  const grid=byLabel('Choose an original motif');assert.equal(grid.children[0].attributes['aria-label'],'Ocean Reverie, shown on pillow');
  byLabel('Ocean Reverie, shown on pillow').listeners.click();const select=byLabel('Product type');select.value='tote';select.listeners.change();
  profile={expression:'new beginnings'};panel.refresh();
  assert.equal(grid.children[0].attributes['aria-label'],'Moonlit Botanica, shown on pillow');
  assert.equal(panel.getSelection().motif.id,'ocean');assert.equal(panel.getSelection().product.id,'tote');assert.equal(panel.getSelection().prototype,null);
  assert.ok(all(host).some(e=>e.textContent?.includes('Expressing: new beginnings')));
});
