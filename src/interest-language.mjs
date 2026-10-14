/** Small explicit public-interest alias map, not general translation. Pure/local.
 * Unknown text remains unchanged. Pronoun/negation markers preserve the existing
 * recipient-vs-giver and exclusion checks before matching English catalog text.
 */
const ALIASES = [
  ['星球大战|星球大戰|星际大战|星際大戰', 'Star Wars'],
  ['机械键盘|機械鍵盤', 'mechanical keyboards'],
  ['咖啡', 'coffee'], ['园艺|園藝|花园|花園', 'gardening'],
  ['陶艺|陶藝', 'pottery'], ['茶', 'tea'],
];
export function normalizeInterestLanguage(value = '') {
  let text = typeof value === 'string' ? value : '';
  // Longer negatives first so 不喜欢 can never become a positive like statement.
  text = text.replace(/不喜欢|不喜歡|讨厌|討厭/g,' dislike ')
    .replace(/不要|避免/g,' avoid ')
    .replace(/喜欢|喜歡|喜爱|喜愛|热爱|熱愛/g,' like ')
    .replace(/我们|我們/g,' we ').replace(/我/g,' I ')
    .replace(/他们|她们|他們|她們/g,' they ').replace(/他|她/g,' they ')
    .replace(/但是|不过|不過|但/g,' but ')
    .replace(/[，、；。！？]/g,'; ').replace(/和|以及/g,' and ');
  for (const [pattern, replacement] of ALIASES) text = text.replace(new RegExp(pattern,'g'),` ${replacement} `);
  return text.replace(/\s+/g,' ').trim();
}
