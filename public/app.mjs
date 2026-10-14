import {reviewContent} from '/modules/product-review.mjs';
import {validateShopProfile,rankShopProducts,SHOP_ENGINE,formatMoney,safeHttpsUrl,productImage,selectedMatches,shopBrief} from '/modules/shop-catalog.mjs';
const $=id=>document.getElementById(id);
const form=$('gift-form');
const state={profile:null,products:[],messages:[],excludedIds:[],excludedCategories:[],result:null,searchSeq:0,productSeq:0,active:null,checkoutAttempts:new Map()};
const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
const button=(text,className,fn)=>{const b=el('button',className,text);b.type='button';b.addEventListener('click',fn);return b;};
function external(text,url,className=''){const a=el('a',className,text);const valid=safeHttpsUrl(url);if(valid){a.href=valid;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';}else a.removeAttribute('href');return a;}
function announce(text){$('result-announcement').textContent=text;}
async function api(payload){
  const res=await fetch('/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',credentials:'same-origin'});
  let data;try{data=await res.json();}catch{throw Object.assign(new Error('The commerce server returned an unreadable response. No payment was made.'),{code:'INVALID_RESPONSE'});}
  if(!res.ok||data.error){const error=typeof data.error==='object'?data.error:{};throw Object.assign(new Error(error.message||data.message||'Shop is unavailable right now. No payment was made.'),{code:error.code||data.code||'SHOP_ERROR',reviewRequired:error.reviewRequired===true,outcomeUncertain:error.outcomeUncertain===true});}return data;
}
function renderMessages(host,messages,{all=true,index=null}={}){
  for(const m of Array.isArray(messages)?messages:[]){
    if(!m||typeof m!=='object'||!['warning','error','info'].includes(m.type))continue;
    if(!all&&index!==null&&!String(m.path??'').startsWith(`$.products[${index}]`))continue;
    const box=el('div',m.type==='info'?'shop-message shop-info':'shop-message shop-warning');
    box.append(el('strong','',m.type==='warning'?'Merchant notice':m.type==='error'?'Merchant update':'Catalog note'),el('p','',String(m.content||m.message||m.code||'Please review this merchant notice.')));
    if(safeHttpsUrl(m.url))box.append(external('Read merchant details ↗',m.url));
    if(safeHttpsUrl(m.image_url)){const image=el('img','notice-image');image.src=m.image_url;image.alt=String(m.content||'Merchant disclosure');image.referrerPolicy='no-referrer';box.append(image);}
    host.append(box);
  }
}
function render(){
  const host=$('results-content');host.replaceChildren();
  if(!state.profile)return;
  const result=rankShopProducts(state.products,state.profile,state);state.result=result;
  $('results-title').textContent=`A thoughtful edit for ${state.profile.recipient}.`;
  renderMessages(host,state.messages);
  for(const note of result.notices)host.append(el('p','result-notice',note));
  if(state.excludedIds.length||state.excludedCategories.length){const bar=el('div','exclusion-bar');bar.append(el('span','',`${state.excludedIds.length} item(s) and ${state.excludedCategories.length} category / categories excluded.`),button('Reset exclusions','text-button',()=>{state.excludedIds=[];state.excludedCategories=[];render();}));host.append(bar);}
  if(!result.recommendations.length){const box=el('div','empty-state no-match');box.append(el('span','no-match-symbol','✧'),el('h4','','No honest match. And that’s okay.'),el('p','',state.products.length?'The returned items did not meet the USD item budget, availability, explicit avoidances and recipient-interest checks. Try a different product query; we won’t silently stretch your budget.':'Shop returned no products for this query. Try different product words or a budget that fits your plans.'));host.append(box);announce('No matching gifts remain.');return;}
  const summary=el('div','result-summary');summary.append(el('span','','✧'));const copy=el('div');copy.append(el('h4','',`${result.recommendations.length} real listings, with a reason for each.`),el('p','',`Shop catalog data · US / USD demo. Item prices are at or below $${state.profile.budget}. Shipping and tax are extra. Ranking is rules-based, not AI.`));summary.append(copy);host.append(summary);
  result.recommendations.forEach((rec,index)=>host.append(card(rec,index)));announce(`${result.recommendations.length} matching listings. ${SHOP_ENGINE.disclosure}`);
}
function card(rec,index){
  const {product:p,variant:v}=rec;const article=el('article','gift-card');
  const media=el('div','card-media');if(rec.image){const img=el('img');img.src=rec.image.url;img.alt=rec.image.alt;img.loading='lazy';img.referrerPolicy='no-referrer';media.append(img);}else media.append(el('span','missing-image','Image not supplied'));
  media.append(el('span','card-rank',index===0?'FIRST DIRECTION':`ANOTHER DIRECTION · ${index+1}`));article.append(media);
  const body=el('div','card-body');body.append(el('p','card-artwork',v.seller.name||v.seller.domain),el('h4','',p.title));
  body.append(el('p','specifications',(v.options??[]).map(o=>`${o.name}: ${o.label}`).join(' · ')||'Featured variant'));
  body.append(el('span','fit-badge','Catalog match · exact options checked next'));
  const reasons=el('ul','reason-list');for(const r of rec.reasons)reasons.append(el('li','',r));body.append(reasons);
  const price=el('div','price-row');price.append(el('span','price-value',formatMoney(v.price)),el('span','','item price · shipping & tax extra'));body.append(price);
  body.append(el('p','merchant-domain',`Sold by ${v.seller.domain}`));
  renderMessages(body,state.messages,{all:false,index:rec.index});
  const actions=el('div','card-actions');const choose=button('Refresh & choose ↗','button primary',()=>openProduct(rec,choose));actions.append(choose,button('Gift brief','text-button',()=>openBrief(rec)));if(rec.url)actions.append(external('View product ↗',rec.url,'text-button'));body.append(actions);
  const feedback=el('div','card-feedback');feedback.append(button('Not this one','feedback-button',()=>{state.excludedIds.push(p.id);render();}));if(rec.category)feedback.append(button(`Avoid ${rec.category.label}`,'feedback-button',()=>{state.excludedCategories.push(rec.category.id);render();}));body.append(feedback);article.append(body);return article;
}
async function search(){
  const seq=++state.searchSeq;const validation=validateShopProfile(Object.fromEntries(new FormData(form)));
  $('form-errors').hidden=validation.valid;$('form-errors').textContent=validation.errors.join(' ');state.products=[];state.messages=[];state.result=null;$('results-content').replaceChildren();
  if(!validation.valid){state.profile=null;$('results-title').textContent='Update the details to search.';announce('Please correct the form. Previous results have been cleared.');return;}
  state.profile=validation.profile;state.excludedIds=[];state.excludedCategories=[];
  $('results-title').textContent='Finding real possibilities…';$('results-content').append(el('p','loading-state','Searching Shop’s merchant catalog. No account or AI model is used.'));
  const submit=form.querySelector('button[type=submit]');submit.disabled=true;announce('Searching Shop.');
  try{const data=await api({action:'search',query:state.profile.query,budget:state.profile.budget});if(seq!==state.searchSeq)return;state.products=data.products??[];state.messages=data.messages??[];render();if(window.innerWidth<651)$('results-region').scrollIntoView({block:'start',behavior:'smooth'});}
  catch(error){if(seq!==state.searchSeq)return;state.products=[];state.messages=[];$('results-title').textContent='The live catalog is unavailable.';$('results-content').replaceChildren(el('p','result-notice',error.message),el('p','field-note','No sample products have been substituted for live results. You can try the search again when the service is available.'));announce(error.message);}
  finally{if(seq===state.searchSeq)submit.disabled=false;}
}
function openBrief(rec){$('brief-text').value=shopBrief(state.profile,rec);$('copy-status').textContent='';$('copy-brief').textContent='Copy brief ↗';$('brief-dialog').showModal();$('copy-brief').focus();}
async function openProduct(rec,opener){
  state.active={rec,opener,product:null,variant:null,selected:[...(rec.variant.options??[])],requested:[...(rec.variant.options??[])],profile:{...state.profile},valid:false};
  $('product-title').textContent=rec.product.title;$('product-detail').replaceChildren();$('checkout-result').replaceChildren();$('product-dialog').showModal();await refreshProduct(state.active.selected);
}
async function refreshProduct(selected){
  const active=state.active;if(!active)return;const seq=++state.productSeq;active.valid=false;active.requested=selected;$('product-status').textContent='Refreshing the exact variant, price and availability…';$('checkout-result').replaceChildren();
  const old=$('create-checkout');if(old)old.disabled=true;
  try{const data=await api({action:'product',productId:active.rec.product.id,selected,budget:active.profile.budget});if(seq!==state.productSeq||active!==state.active)return;
    const p=data.product;const v=p?.variants?.[0];if(!p||!v)throw new Error('Shop did not return an exact product variant.');
    active.product=p;active.variant=v;active.selected=selected;
    active.recipientMatch=rankShopProducts([p],active.profile,state).recommendations.length>0;
    active.valid=active.recipientMatch&&selectedMatches(selected,p,v)&&v.availability?.available===true&&v.price?.currency==='USD'&&Number.isSafeInteger(v.price?.amount)&&v.price.amount<=Math.round(active.profile.budget*100)&&v.price.amount>=0;
    renderProduct(data.messages??[]);$('product-status').textContent=active.valid?'Refreshed now. Review the exact option and item price below.':'This selection cannot be checked out here. It may have changed, be unavailable, exceed the budget, or differ from the requested options.';
  }catch(error){if(seq!==state.productSeq||active!==state.active)return;active.valid=false;$('product-status').textContent=error.message;$('product-detail').replaceChildren(el('p','result-notice','No checkout was created. Refresh failed; close and choose again only when you want a fresh read.'));}
}
function renderProduct(messages){
  const active=state.active;const p=active.product;const v=active.variant;const host=$('product-detail');host.replaceChildren();
  const image=productImage(p,v);if(image){const img=el('img','detail-image');img.src=image.url;img.alt=image.alt;img.referrerPolicy='no-referrer';host.append(img);}
  host.append(el('p','merchant-domain',`${v.seller?.name||'Merchant'} · ${v.seller?.domain||'Unknown seller'}`),el('p','detail-price',formatMoney(v.price)),el('p','field-note',`Availability: ${v.availability?.available===true?'reported available at refresh':'not confirmed available'}. Item price only; shipping and tax are extra.`));
  const options=el('div','variant-options');for(const option of Array.isArray(p.options)?p.options:[]){
    if(!option.name||!Array.isArray(option.values))continue;const field=el('div','field');const label=el('label','',option.name);const select=el('select');select.setAttribute('aria-label',option.name);
    const requested=active.selected.find(x=>x.name===option.name)?.label;for(const value of option.values){if(typeof value.label!=='string')continue;const o=el('option','',value.label+(value.available===false?' (unavailable)':''));o.value=value.label;if(value.label===requested)o.selected=true;o.disabled=value.exists===false;select.append(o);}
    select.addEventListener('change',()=>{const next=active.selected.filter(x=>x.name!==option.name);next.push({name:option.name,label:select.value});refreshProduct(next);});label.append(select);field.append(label);options.append(field);
  }host.append(options);renderMessages(host,messages);
  if(!selectedMatches(active.selected,p,v))host.append(el('p','result-notice','Shop relaxed or changed the selected options. We will not silently accept that substitution. Choose a supported option or return to the results.'));
  if(!active.recipientMatch)host.append(el('p','result-notice','The refreshed product no longer passes the recipient-interest or avoidance checks. Choose a different gift.'));
  host.append(el('p','checkout-consent','Creating a checkout sends this variant and quantity 1 to the named merchant through Shop. It does not pay or place an order. Enter delivery and payment details only on the merchant page.'));
  const b=button('Create merchant checkout →','button primary full-width',()=>createCheckout());b.id='create-checkout';b.disabled=!active.valid;host.append(b);
  const key=`${p.id}|${v.id}`;if(state.checkoutAttempts.has(key)){b.disabled=true;renderCheckoutAttempt(state.checkoutAttempts.get(key));}
}
async function createCheckout(){
  const active=state.active;if(!active?.valid||!active.product||!active.variant)return;
  const key=`${active.product.id}|${active.variant.id}`;if(state.checkoutAttempts.has(key))return;
  const snapshot={product:active.product,variant:active.variant,selected:[...active.selected],profile:{...active.profile}};
  const attempt={status:'pending',requestId:crypto.randomUUID(),active:snapshot};state.checkoutAttempts.set(key,attempt);$('create-checkout').disabled=true;renderCheckoutAttempt(attempt);
  try{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(reviewContent(snapshot.product,snapshot.variant)));const expectedDetailsHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');const data=await api({action:'checkout',productId:snapshot.product.id,selected:snapshot.selected,variantId:snapshot.variant.id,shop:snapshot.variant.seller.domain,budget:snapshot.profile.budget,expectedPrice:snapshot.variant.price,expectedDetailsHash,requestId:attempt.requestId,confirmed:true});attempt.status='ready';attempt.data=data.checkout?{...data.checkout,messages:data.messages??data.checkout.messages}:data;}
  catch(error){attempt.status='error';attempt.error=error.message;attempt.code=error.code;attempt.reviewRequired=error.reviewRequired;attempt.outcomeUncertain=error.outcomeUncertain;if(error.reviewRequired&&!error.outcomeUncertain)state.checkoutAttempts.delete(key);}
  if(state.active===active&&`${active.product?.id}|${active.variant?.id}`===key)renderCheckoutAttempt(attempt);
}
function renderCheckoutAttempt(attempt){
  const host=$('checkout-result');host.replaceChildren();
  if(attempt.status==='pending'){host.append(el('p','product-status','Refreshing once more and preparing your merchant checkout…'));return;}
  if(attempt.status==='error'){host.append(el('p','result-notice',attempt.error),el('p','field-note','No payment was made by this app. We will not automatically repeat an uncertain checkout request.'));if(attempt.reviewRequired&&!attempt.outcomeUncertain)host.append(button('Refresh and review changes','button secondary',()=>refreshProduct(state.active.selected)));return;}
  const d=attempt.data;host.append(el('h3','checkout-ready','Your merchant checkout'),el('p','field-note',`Status: ${d.status||'not supplied'}. Review the final total and all merchant terms before paying.`));
  for(const item of d.line_items??[]){const line=el('div','checkout-line');line.append(el('strong','',item.item?.title||attempt.active.product.title),el('span','',`Quantity: ${item.quantity??1}`));host.append(line);}
  renderMessages(host,d.messages);
  const totals=el('div','checkout-totals');for(const total of d.totals??[]){const row=el('div');row.append(el('span','',String(total.display_text||total.type||'Amount')),el('strong','',formatMoney({amount:total.amount,currency:d.currency})));totals.append(row);for(const sub of total.lines??[]){const child=el('div','total-subline');child.append(el('span','',String(sub.display_text||sub.type||'Detail')),el('span','',formatMoney({amount:sub.amount,currency:d.currency})));totals.append(child);}}host.append(totals);
  const links=el('div','checkout-links');for(const link of d.links??[]){if(safeHttpsUrl(link.url))links.append(external(link.title||link.type||'Merchant terms',link.url));}host.append(links);
  if(safeHttpsUrl(d.continue_url))host.append(external('Review & pay at merchant ↗',d.continue_url,'button primary full-width'));else host.append(el('p','result-notice','The merchant did not return a usable secure checkout link. Do not assume a checkout or payment is complete.'));
  host.append(el('p','field-note','You have not paid through this app. The merchant page is where you review delivery, final charges and payment.'));
}
form.addEventListener('submit',e=>{e.preventDefault();search();});
$('try-example').addEventListener('click',()=>{const values={recipient:'Alex',relationship:'Friend',occasion:'Thank you',budget:'75',likes:'They love ocean walks, collecting shells, and hosting friends for dinner.',query:'ocean gifts for hosting',dislikes:'Silk and pillows'};Object.entries(values).forEach(([k,v])=>form.elements.namedItem(k).value=v);form.requestSubmit();});
$('close-brief').addEventListener('click',()=>$('brief-dialog').close());
$('close-product').addEventListener('click',()=>$('product-dialog').close());
$('product-dialog').addEventListener('close',()=>{++state.productSeq;state.active?.opener?.focus();});
for(const id of ['brief-dialog','product-dialog'])$(id).addEventListener('click',event=>{if(event.target===$(id)){const r=$(id).getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$(id).close();}});
$('copy-brief').addEventListener('click',async()=>{try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText($('brief-text').value);$('copy-status').textContent='Copied. Your brief stays under your control.';$('copy-brief').textContent='Copied ✓';}catch{$('brief-text').focus();$('brief-text').select();$('copy-status').textContent='Clipboard access is unavailable. The brief is selected; use your device’s Copy command.';}});
