import {relevantCustomConcepts,customBrief,CUSTOM_PATTERN_IMAGES} from '/modules/custom-concepts.mjs';

/** Submitted-profile reader is supplied by the parent; no input wizard or network. */
export function initCustomPanel({host,getProfile,onCopyBrief,onSelectionChange,motifImages=CUSTOM_PATTERN_IMAGES}){
  if(!host||typeof getProfile!=='function')throw new Error('A host and submitted-profile reader are required.');
  const doc=host.ownerDocument;
  const node=(tag,className,text)=>{const e=doc.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
  let selected=null,selectedMotif=null,browseAll=false;
  const context=node('p','custom-context');
  const notice=node('p','custom-expression-note field-note');
  const grid=node('div','custom-choice-grid custom-motif-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','Relevant original product concepts');
  const patterns=node('div','custom-choice-grid custom-motif-grid');patterns.setAttribute('role','group');patterns.setAttribute('aria-label','Choose a relevant pattern');
  const summary=node('div','custom-selection-summary');summary.setAttribute('aria-live','polite');
  const actions=node('div','custom-exploration');
  host.replaceChildren(context,notice,patterns,grid,summary,actions);
  function render(){
    const p=getProfile()||{};
    const result=relevantCustomConcepts(p,{browseAll});
    context.textContent=`For ${p.relationship==='Myself'||p.selfGift?'you':p.recipient||'your recipient'}${p.expression?` · Expressing: ${p.expression}`:''}. Using your submitted details.`;
    notice.textContent=browseAll?'Browsing original concepts, not personalized matches. Explicit avoidances still apply.':result.notice;
    if(selected&&!result.cards.some(card=>card.prototype.id===selected.prototype.id)){selected=null;if(typeof onSelectionChange==='function')onSelectionChange(null,p);}
    const motifs=[...new Map(result.cards.map(card=>[card.prototype.theme,card.selection.motif])).values()];
    if(selectedMotif&&!motifs.some(m=>m.id===selectedMotif))selectedMotif=null;
    patterns.replaceChildren(...motifs.map(motif=>{
      const b=node('button','custom-choice');b.type='button';b.setAttribute('aria-label',`Pattern: ${motif.label}`);b.setAttribute('aria-pressed',String(selectedMotif===motif.id));
      const asset=motifImages[motif.id];
      if(asset){const img=node('img','custom-choice-image');img.src=asset;img.alt=`${motif.label} original artwork`;img.width=240;img.height=240;b.append(img);}
      b.append(node('strong','',motif.label));
      b.addEventListener('click',()=>{selectedMotif=motif.id;selected=null;render();if(typeof onSelectionChange==='function')onSelectionChange(null,getProfile()||{});});return b;
    }));
    grid.replaceChildren(...result.cards.filter(card=>card.prototype.theme===selectedMotif).map(card=>{
      const b=node('button','custom-choice');b.type='button';b.setAttribute('aria-label',`${card.prototype.artwork} · ${card.prototype.name}`);b.setAttribute('aria-pressed',String(selected?.prototype.id===card.prototype.id));
      const img=node('img','custom-choice-image');img.src=card.prototype.image;img.alt=card.prototype.alt;img.width=240;img.height=240;img.loading='lazy';
      b.append(img,node('strong','',card.prototype.artwork),node('span','',card.prototype.name),node('span','custom-motif-fit field-note',card.reasons.join(' ')),node('span','field-note','Original digital prototype · not a purchasable listing'));
      if(card.unknownFactors.length)b.append(node('span','field-note',`Not verified: ${card.unknownFactors.map(f=>f.label).join(', ')}.`));
      b.addEventListener('click',()=>{selected=card.selection;render();if(typeof onSelectionChange==='function')onSelectionChange(selected,getProfile()||{});});return b;
    }));
    summary.replaceChildren();
    if(!selectedMotif&&motifs.length)summary.append(node('p','field-note','Choose a pattern above to see its existing product concepts.'));
    if(selected){
      summary.append(node('h3','',`${selected.prototype.artwork} · ${selected.prototype.name}`),node('p','field-note','Selected design direction. Price, production, availability and delivery are unverified. Expression meanings are proposed readings of these designs, not universal cultural claims.'));
      if(typeof onCopyBrief==='function'){const b=node('button','text-button','View design brief');b.type='button';b.addEventListener('click',()=>onCopyBrief(customBrief(getProfile()||{},selected),selected));summary.append(b);}
    }
    actions.replaceChildren();
    if(!browseAll){const browse=node('button','text-button','Browse all original concepts');browse.type='button';browse.addEventListener('click',()=>{browseAll=true;render();});actions.append(browse);}
    else{const back=node('button','text-button','Back to relevant concepts');back.type='button';back.addEventListener('click',()=>{browseAll=false;render();});actions.append(back);}
    actions.append(node('p','field-note','Existing digital renders, not physical samples. No verified prices, availability or delivery promises.'));
  }
  render();
  return {refresh:()=>{browseAll=false;render();},getSelection:()=>selected};
}
