/** Curated prototype data, not a live storefront or availability feed. */
export const CATALOG_INFO = Object.freeze({
  status: 'Sample prototype catalog',
  sourceDate: '2026-10-14',
  currency: null,
  currencyLabel: 'Demo units; currency unverified',
  pricingDisclosure: 'Candidate prices are illustrative, not saved retail prices. Currency, shipping, tax, duties and availability are unverified.',
  imageDisclosure: 'Arcade digital product renders, not photographs of physical samples.',
  atelierUrl: 'https://expressionatelier.vercel.app/'
});
const common = { availability: 'Unverified', liveListing: false, colors: ['blue', 'navy', 'teal', 'gold'], original: true };
const data = [
  ['celestial-pillow', 'Celestial Voyager', 'Decorative Pillow', 'pillow', 'celestial', 119, 62.14, '18 × 18 in · Cotton cover + microfiber insert', ['cotton','microfiber'], ['home','decor','comfort'], 'celestial-voyager-pillow', 'Navy and teal pillow with a gold-toned galaxy and celestial linework.'],
  ['ocean-pillow', 'Ocean Reverie', 'Decorative Pillow', 'pillow', 'ocean', 119, 62.14, '18 × 18 in · Cotton cover + microfiber insert', ['cotton','microfiber'], ['home','decor','comfort'], 'ocean-reverie-pillow', 'Sea-blue pillow with a nautilus shell, moonlit waves and pale flowers.'],
  ['botanica-pillow', 'Moonlit Botanica', 'Decorative Pillow', 'pillow', 'botanical', 119, 62.14, '18 × 18 in · Cotton cover + microfiber insert', ['cotton','microfiber'], ['home','decor','comfort'], 'moonlit-botanica-pillow', 'Navy pillow with green woodland ferns, pale flowers and a moon.'],
  ['passage-pillow', 'Golden Passage', 'Decorative Pillow', 'pillow', 'geometric', 119, 62.14, '18 × 18 in · Cotton cover + microfiber insert', ['cotton','microfiber'], ['home','decor','comfort'], 'golden-passage-pillow', 'Navy and teal pillow with geometric mountains, arches and a gold-toned path.'],
  ['passage-tote', 'Golden Passage', 'Cotton Canvas Tote', 'tote', 'geometric', 89, 34.86, '13 × 15 in · One cotton canvas tote', ['cotton','canvas'], ['travel','everyday','bags'], 'golden-passage-tote', 'Cream-handled cotton tote with a navy, teal and gold-toned geometric landscape.'],
  ['botanica-towels', 'Moonlit Botanica', 'Linen Tea Towels', 'towels', 'botanical', 119, 64.15, 'Set of 2 · 18 × 20 in each · Linen', ['linen'], ['hosting','kitchen','cooking'], 'moonlit-botanica-tea-towels', 'Linen tea towel with green woodland foliage and pale flowers on navy.'],
  ['celestial-square', 'Celestial Voyager', 'Silk Pocket Square', 'pocket-square', 'celestial', 159, 104.95, '16 × 16 in · One silk twill pocket square', ['silk'], ['style','accessories','formalwear'], 'celestial-voyager-pocket-square', 'Navy and teal silk pocket square with galaxies and gold-toned orbital lines.'],
  ['ocean-napkins', 'Ocean Reverie', 'Cotton Cocktail Napkins', 'napkins', 'ocean', 89, 34.02, 'Set of 6 · 5 × 5 in each · Cotton', ['cotton'], ['hosting','table','entertaining'], 'ocean-reverie-cocktail-napkins', 'Cotton cocktail napkin with blue ocean waves, a nautilus shell and pale florals.']
];
export const CATALOG = Object.freeze(data.map(([id, artwork, name, category, theme, candidatePrice, supplierSubtotal, specifications, materials, uses, image, alt]) => Object.freeze({
  ...common, colors: [...common.colors, ...(theme === 'botanical' ? ['green', 'ivory'] : theme === 'ocean' || theme === 'geometric' ? ['ivory','cream'] : [])], id, artwork, name, category, theme, candidatePrice, supplierSubtotal, specifications, materials, uses,
  image: `/assets/${image}-arcade-preview.png`, alt,
  motifs: theme === 'ocean' ? ['shell','wave','flowers','moon'] : theme === 'botanical' ? ['flowers','plants','moon'] : theme === 'celestial' ? ['stars','galaxy'] : ['mountains','arches'],
  supplierCostNote: 'Known quantity-one subtotal includes the displayed drop-ship fee, not a verified all-in delivered cost.'
})));
