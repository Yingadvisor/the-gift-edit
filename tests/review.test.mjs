import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { recommend, ENGINE } from '../src/recommender.mjs';
import { buildBrief } from '../src/brief.mjs';
import { CATALOG } from '../src/catalog.mjs';
import * as shop from '../src/shop-catalog.mjs';

const profile = (changes = {}) => ({ recipient: 'Alex', budget: 200, likes: 'They love ocean.', dislikes: '', ...changes });

test('review: Unicode apostrophe negation never becomes positive ocean evidence', () => {
  const result = recommend(profile({ likes: 'They don’t like ocean.' }));
  assert.equal(result.status, 'no-match');
});

test('review: negative contracted copula never becomes positive ocean evidence', () => {
  const result = recommend(profile({ likes: "They aren't into ocean." }));
  assert.equal(result.status, 'no-match');
});

test('review: mixed giver and recipient clauses do not attribute giver taste to recipient', () => {
  const result = recommend(profile({ likes: 'I love ocean and she loves gardening.' }), { limit: 8 });
  assert.ok(result.recommendations.every(rec => rec.product.theme !== 'ocean'));
});

test('review: placeholder floral-pattern exclusion rejects flower-bearing ocean designs', () => {
  const result = recommend(profile({ dislikes: 'floral patterns' }), { limit: 8 });
  assert.ok(result.recommendations.every(rec => !rec.product.motifs.includes('flowers')));
});

test('review: green exclusion rejects known green botanical imagery', () => {
  const result = recommend(profile({ likes: 'They love gardening.', dislikes: 'green' }), { limit: 8 });
  assert.ok(result.recommendations.every(rec => !/\bgreen\b/i.test(rec.product.alt)));
});

test('review: explicit ID/category exclusions and numeric budgets remain hard filters', () => {
  for (const budget of [1, 88.99, 89, 118.99, 119, 158.99, 159, 10000]) {
    for (const excludedCategories of [[], ['pillow'], ['tote', 'napkins'], [...new Set(CATALOG.map(p => p.category))]]) {
      const excludedIds = ['celestial-square'];
      const result = recommend(profile({ budget, likes: 'They love astronomy, ocean, gardening, travel, and hosting.' }), { excludedIds, excludedCategories, limit: 8 });
      assert.ok(result.recommendations.every(rec => rec.product.candidatePrice <= budget));
      assert.ok(result.recommendations.every(rec => !excludedIds.includes(rec.product.id)));
      assert.ok(result.recommendations.every(rec => !excludedCategories.includes(rec.product.category)));
    }
  }
});

test('review: all eight asset hashes agree with checked-in provenance', async () => {
  const root = new URL('../', import.meta.url);
  const provenance = JSON.parse(await readFile(new URL('docs/asset-provenance.json', root), 'utf8'));
  assert.equal(provenance.assets.length, 8);
  for (const asset of provenance.assets) {
    assert.equal(createHash('sha256').update(await readFile(new URL(asset.file, root))).digest('hex'), asset.sha256);
  }
});

// A small DOM harness exercises application transitions without external browser
// dependencies. It deliberately uses the real recommender and brief functions.
class Node {
  constructor(tag = '') { this.tagName = tag; this.children = []; this.listeners = {}; this.textContent = ''; this.hidden = false; this.isConnected = true; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  scrollIntoView() {}
  focus() {}
  setAttribute(name,value) {this[name]=value;}
  removeAttribute(name) {delete this[name];}
  querySelector() {return this.submitButton ??= new Node('button');}
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
}
function descendants(node) { return [node, ...node.children.filter(c => typeof c !== 'string').flatMap(descendants)]; }

test('review: invalid resubmission cannot leave actionable stale recommendations', async () => {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Node(id)); return elements.get(id); };
  const form = get('gift-form');
  form.values = {...profile(),query:'ocean gifts'};
  const context = vm.createContext({initCustomPanel:()=>({refresh(){}}),
    recommend, ENGINE, buildBrief, ...shop, URL,
    fetch: async () => ({ok:true,json:async()=>({products:[{id:'gid://shopify/p/mock',title:'Ocean ceramic mug',variants:[{id:'gid://shopify/ProductVariant/mock',price:{amount:2400,currency:'USD'},availability:{available:true},seller:{domain:'mock.myshopify.com'},options:[]}]}],messages:[]})}),
    document: { getElementById: get, createElement: tag => new Node(tag) },
    window: { innerWidth: 1000 },
    FormData: class { constructor(node) { return Object.entries(node.values); } },
    navigator: {},
  });
  const app = (await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8')).replace(/^import[^\n]*\n/gm, '');
  vm.runInContext(app, context);
  form.listeners.submit({ preventDefault() {} });
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(descendants(get('results-content')).some(node => node.className === 'gift-card'));
  form.values = {...profile({ recipient: '', budget: 1 }),query:'ocean gifts'};
  form.listeners.submit({ preventDefault() {} });
  assert.equal(get('form-errors').hidden, false);
  assert.equal(descendants(get('results-content')).filter(node => node.className === 'gift-card').length, 0);
});


test('review: hero image sizing overrides intrinsic HTML heights', async () => {
  const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.hero-product img\{[^}]*height:auto/);
});
