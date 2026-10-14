import test from 'node:test';
import assert from 'node:assert/strict';
import {GIFT_STYLES,GIFT_LIFESTYLES,EXPRESSION_CHOICES,validateGiftContext,combinedExpression} from '../src/gift-context.mjs';
import {validateShopProfile} from '../src/shop-catalog.mjs';
const profile={recipient:'Alex',relationship:'Friend',likes:'They love ocean.',query:'ocean gifts',budget:75};

test('Gift context review: style and lifestyle default separately and every declared combination is valid',()=>{
  assert.deepEqual(validateGiftContext(),{style:'any',lifestyle:'any'});
  for(const style of GIFT_STYLES)for(const lifestyle of GIFT_LIFESTYLES)assert.deepEqual(validateGiftContext({style,lifestyle}),{style,lifestyle});
  assert.ok(Object.isFrozen(GIFT_STYLES));assert.ok(Object.isFrozen(GIFT_LIFESTYLES));assert.ok(Object.isFrozen(EXPRESSION_CHOICES));
});

test('Gift context review: audience identities cannot be substituted for style or lifestyle',()=>{
  for(const key of ['style','lifestyle'])for(const value of ['men','women','unisex','PRIVATE_NAME',4,{},[]]){
    assert.throws(()=>validateGiftContext({[key]:value}));assert.equal(validateShopProfile({...profile,[key]:value}).valid,false);
  }
  const checked=validateShopProfile({...profile,style:'minimalist',lifestyle:'healthcare',audience:'men'});
  assert.equal(checked.valid,true);assert.equal(checked.profile.style,'minimalist');assert.equal(checked.profile.lifestyle,'healthcare');assert.equal(checked.profile.audience,'men');
});

test('Gift context review: selected meanings combine deterministically with optional own words without mutating choices',()=>{
  const choices=['Gratitude','Courage','Courage','not-an-offered-choice'];const before=[...choices];
  assert.equal(combinedExpression(choices,'  Thank you for being there  '),'Courage; Gratitude; Thank you for being there');assert.deepEqual(choices,before);
  assert.equal(combinedExpression(),'');assert.equal(combinedExpression([],'  '),'');assert.equal(combinedExpression(['Protection and care']),'Protection and care');
});

test('Gift context review: merged expression is still bounded by the shared validated profile limit',()=>{
  const expression=combinedExpression([...EXPRESSION_CHOICES],'x'.repeat(400));
  assert.equal(validateShopProfile({...profile,expression}).valid,false);
  assert.equal(validateShopProfile({...profile,expression:combinedExpression(['Courage'],'A new chapter')}).valid,true);
});
