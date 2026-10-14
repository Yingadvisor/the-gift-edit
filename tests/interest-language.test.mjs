import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInterestLanguage} from '../src/interest-language.mjs';
import {extractEvidence} from '../src/recommender.mjs';
import {buildGiftSearchPlan,buildGiftSearchQuery} from '../src/gift-search.mjs';
import {rankShopProducts} from '../src/shop-catalog.mjs';
const product=(title,id)=>({id:`gid://shopify/Product/${id}`,title,description:title,selected:[],variants:[{id:`gid://shopify/ProductVariant/${id}`,options:[],price:{amount:2400,currency:'USD'},availability:{available:true},url:`https://merchant.example.com/products/${id}`,seller:{name:'Fixture merchant',domain:'fixture.myshopify.com'}}]});
const profile={recipient:'小明',likes:'他喜欢咖啡和园艺',dislikes:'',query:'coffee gifts',budget:75};

test('small public-interest alias set yields focused English search, not claimed general translation',()=>{
  assert.equal(buildGiftSearchQuery({likes:'他喜欢星球大战和咖啡和园艺'}),'Star Wars');
  assert.deepEqual(buildGiftSearchPlan(profile),{queries:['coffee gifts','gardening gifts'],hasTheme:false});
  assert.deepEqual(buildGiftSearchPlan({likes:'她喜欢机械键盘和陶艺和茶'}).queries,['mechanical keyboards gifts','pottery gifts','tea gifts']);
  assert.equal(normalizeInterestLanguage('未知兴趣'),'未知兴趣');
});

test('Chinese giver and negatives are preserved by existing evidence guards',()=>{
  const evidence=extractEvidence({...profile,likes:'我喜欢咖啡，她喜欢园艺但不喜欢陶艺',dislikes:'茶'});
  assert.match(evidence.positiveText,/gardening/);
  assert.doesNotMatch(evidence.positiveText,/coffee|pottery|tea/);
  assert.match(evidence.negativeText,/pottery/);
  assert.match(evidence.negativeText,/tea/);
  assert.equal(buildGiftSearchQuery({likes:'我喜欢咖啡，她喜欢机械键盘'}),'mechanical keyboards gifts');
  assert.equal(buildGiftSearchQuery({likes:'他不喜欢星球大战，但喜欢咖啡'}),'coffee gifts');
  for(const verb of ['不喜欢','讨厌','不要','避免']) assert.doesNotMatch(extractEvidence({...profile,likes:`他${verb}咖啡`}).positiveText,/coffee/);
});

test('normalized Chinese preferences and exclusions rank English merchant-shaped fixtures',()=>{
  const products=[product('Coffee brewing kit',1),product('Gardening tool set',2),product('Pottery vase',3)];
  const result=rankShopProducts(products,profile);
  assert.deepEqual(new Set(result.recommendations.map(r=>r.product.title)),new Set(['Coffee brewing kit','Gardening tool set']));
  const filtered=rankShopProducts(products,{...profile,dislikes:'咖啡'});
  assert.deepEqual(filtered.recommendations.map(r=>r.product.title),['Gardening tool set']);
  const theme=rankShopProducts([product('Star Wars collectible',4),product('Space collectible',5)],{...profile,likes:'他喜欢星球大战',query:'Star Wars'});
  assert.deepEqual(theme.recommendations.map(r=>r.product.title),['Star Wars collectible']);
});
