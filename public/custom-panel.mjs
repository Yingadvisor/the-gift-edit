import {CUSTOM_PRODUCTS,CUSTOM_MOTIFS,customSelection,customBrief,rankCustomMotifs} from '/modules/custom-concepts.mjs';

/** Inline local concept picker. getProfile reads the existing form; no network or storage. */
export function initCustomPanel({host,getProfile,onCopyBrief,onSelectionChange}){
  if(!host||typeof getProfile!=='function')throw new Error('A host and current-profile reader are required.');
  const doc=host.ownerDocument;
  const node=(tag,className,text)=>{const e=doc.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
  const image=(item)=>{const img=node('img','custom-choice-image');img.src=item.image;img.alt=item.alt;img.loading='lazy';img.width=240;img.height=240;return img;};
  let productId='pillow',motifId='celestial';
  const context=node('p','custom-context');
  const expressionNote=node('p','custom-expression-note field-note');
  const productLabel=node('label','custom-product-label','Product type');
  const productSelect=node('select','custom-product-select');productSelect.setAttribute('aria-label','Product type');
  for(const item of CUSTOM_PRODUCTS){const option=node('option','',item.label);option.value=item.id;productSelect.append(option);}
  productSelect.value=productId;productLabel.append(productSelect);
  const motifGrid=node('div','custom-choice-grid custom-motif-grid');motifGrid.setAttribute('role','group');motifGrid.setAttribute('aria-label','Choose an original motif');
  const summary=node('div','custom-selection-summary');summary.setAttribute('aria-live','polite');
  const status=node('p','field-note');status.setAttribute('role','status');
  host.replaceChildren(context,expressionNote,productLabel,node('p','field-note','Select a motif below. References are shown on pillows.'),motifGrid,summary,status);
  function changed(){status.textContent='';render();if(typeof onSelectionChange==='function')onSelectionChange(customSelection(productId,motifId),getProfile()||{});}
  productSelect.addEventListener('change',()=>{if(CUSTOM_PRODUCTS.some(item=>item.id===productSelect.value)){productId=productSelect.value;changed();}});
  const motifButtons=CUSTOM_MOTIFS.map(item=>{
    const b=node('button','custom-choice');b.type='button';b.setAttribute('aria-label',`${item.label}, shown on pillow`);
    const fit=node('span','custom-motif-fit field-note');b.append(image(item.reference),node('strong','',item.label),fit);b.addEventListener('click',()=>{motifId=item.id;changed();});motifGrid.append(b);return {item,button:b,fit};
  });
  function render(){
    const p=getProfile()||{};
    context.textContent=`For ${p.relationship==='Myself'||p.selfGift?'you':p.recipient||'your recipient'} · ${p.occasion||'your occasion'} · ${p.budget?`planning budget $${p.budget}`:'budget not specified'}. Using your existing details.`;
    const ranked=rankCustomMotifs(p.expression);
    const matched=ranked.filter(item=>item.matched);
    expressionNote.textContent=p.expression?`Expressing: ${p.expression}. ${matched.length?'Suggested motifs appear first, using simple keyword matches.':'No keyword match; explore any motif.'} Meanings are interpretations of these designs, not universal cultural claims. Your selection stays unchanged.`:'Optional: add what you want to express in your existing details, such as protection, courage, enduring companionship or new beginnings.';
    motifGrid.replaceChildren(...ranked.map(item=>{
      const entry=motifButtons.find(button=>button.item.id===item.id);
      entry.fit.textContent=`${item.matched?'Suggested · ':''}${item.meaning}`;
      return entry.button;
    }));
    productSelect.value=productId;
    for(const {item,button} of motifButtons)button.setAttribute('aria-pressed',String(item.id===motifId));
    const selection=customSelection(productId,motifId);
    const preview=node('div','custom-preview');preview.append(node('h3','',`${selection.product.label} × ${selection.motif.label}`));
    preview.append(node('p','fit-badge',selection.status),node('p','custom-design-meaning field-note',ranked.find(item=>item.id===motifId).interpretation));
    if(selection.prototype)preview.append(image(selection.prototype),node('p','field-note','Existing digital prototype, not a physical sample.'));
    else preview.append(node('p','result-notice','Concept not rendered. The motif reference above is on a pillow, not this product. Production feasibility is unconfirmed.'));
    preview.append(node('p','field-note','Concept only, not a listing. Price, availability, materials and delivery are unverified. Your avoidances and deadline are retained, not verified against this concept.'));
    if(typeof onCopyBrief==='function'){
      const action=node('button','text-button','View design brief');action.type='button';action.addEventListener('click',()=>{
        const current=getProfile()||{};
        onCopyBrief(customBrief(current,customSelection(productId,motifId)),customSelection(productId,motifId));
        status.textContent='Nothing was sent or ordered.';
      });preview.append(action);
    }
    summary.replaceChildren(preview);
  }
  render();
  return {refresh:render,getSelection:()=>customSelection(productId,motifId)};
}
