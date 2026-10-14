import test from 'node:test';
import assert from 'node:assert/strict';
import {assessGiftRole, primaryGiftValueScore} from '../src/gift-quality.mjs';
const role = (title, profile={}, description='') => assessGiftRole({title,description}, {}, profile).role;
test('cards and packaging are add-ons even for birthdays with a large budget', () => {
  for (const title of ['Ocean greeting card','Happy birthday card','Ocean wave card','Gift wrapping paper','Empty gift box','Party decorations','Birthday balloons','Cake topper']) {
    assert.equal(role(title,{occasion:'Birthday',likes:'Ocean walks',budget:100}), 'addon', title);
  }
});
test('explicit recipient interests or query can request add-on products as main gifts', () => {
  assert.equal(role('Ocean greeting card',{likes:'They collect greeting cards'}),'primary');
  assert.equal(role('Birthday balloons',{query:'birthday balloons'}),'primary');
  assert.equal(role('Gift wrapping paper',{query:'gift wrapping paper'}),'primary');
  assert.equal(role('Ocean greeting card',{likes:'They like ocean',occasion:'greeting cards'}),'addon');
});
test('real card-named gifts and incidental wrapping remain main gifts', () => {
  for (const title of ['Blue cardigan','Ocean card game','Leather wallet card holder','Playing cards','Tarot cards','Camera memory card','Tea gift box','Ceramic mug','Ceramic mug with a greeting card','Tea set + greeting card']) assert.equal(role(title,{},'Gift wrapping available; includes a greeting card.'),'primary',title);
  assert.equal(role('Gift box',{},'Empty packaging only. Contents not included.'),'addon');
  assert.equal(role('Tea gift box',{},'Contains tea and a mug.'),'primary');
});
test('soft value ranking prefers 20–80% without rejecting inexpensive gifts or demanding full spend',()=>{
  assert.equal(primaryGiftValueScore(5000,100),1);
  assert.equal(primaryGiftValueScore(2000,100),1);
  assert.equal(primaryGiftValueScore(8000,100),1);
  assert.ok(primaryGiftValueScore(500,100)>0);
  assert.ok(primaryGiftValueScore(10000,100)<primaryGiftValueScore(5000,100));
  assert.equal(primaryGiftValueScore(10001,100),0);
});
