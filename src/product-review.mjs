/** Canonical public product details used for a shopper-reviewed content hash.
 * Contains no recipient profile, private preferences or credentials. */
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>!['__proto__','constructor','prototype'].includes(k)).map(k=>[k,canonical(value[k])]));
  return value??null;
}
export function reviewContent(product,variant){return JSON.stringify(canonical({id:product?.id,title:product?.title,category:product?.category,description:product?.description,metadata:product?.metadata,variant:{id:variant?.id,title:variant?.title,description:variant?.description,options:variant?.options??[]}}));}
