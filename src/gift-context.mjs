/** Optional declared shopping context. These values never imply identity or hard eligibility. */
export const GIFT_STYLES=Object.freeze(['any','minimalist','colorful','classic','natural','playful']);
export const GIFT_LIFESTYLES=Object.freeze(['any','office','home-office','outdoors','healthcare','education','public-service','travel','caregiving']);
export function validateGiftContext(input={}){const style=input?.style??'any',lifestyle=input?.lifestyle??'any';if(!GIFT_STYLES.includes(style)||!GIFT_LIFESTYLES.includes(lifestyle))throw new Error('Choose supported optional style and lifestyle values.');return {style,lifestyle};}
export const EXPRESSION_CHOICES=Object.freeze(['Protection and care','Courage','Enduring companionship','New beginnings','Gratitude','Rest and renewal']);
export function combinedExpression(selected=[],text=''){return [...EXPRESSION_CHOICES.filter(value=>selected.includes(value)),String(text??'').trim()].filter(Boolean).join('; ');}
