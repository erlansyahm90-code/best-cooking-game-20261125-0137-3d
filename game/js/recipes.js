// recipes.js — Ingredients and the 7 Junction Kitchen recipes.
// Original names, train-station themed. Each recipe is a list of components;
// a component is one ingredient that must be prepped (chop / cook / both)
// before it can be plated. Shared ingredients combine in different ways.

// Ingredient id -> display + colour (0-1 RGB) + base price (coins when served).
export const INGREDIENTS = {
  bread:   { name: 'Roti',     color: [0.85, 0.62, 0.30], price: 4 },
  tomato:  { name: 'Tomat',    color: [0.85, 0.20, 0.16], price: 3 },
  lettuce: { name: 'Selada',   color: [0.35, 0.70, 0.25], price: 3 },
  carrot:  { name: 'Wortel',   color: [0.95, 0.50, 0.10], price: 3 },
  cheese:  { name: 'Keju',     color: [0.98, 0.80, 0.20], price: 5 },
  patty:   { name: 'Patty',    color: [0.55, 0.32, 0.18], price: 6 },
  potato:  { name: 'Kentang',  color: [0.90, 0.75, 0.45], price: 3 },
  mushroom:{ name: 'Jamur',    color: [0.80, 0.70, 0.60], price: 5 },
};

// prep: 'raw' (no prep), 'chop', 'cook', 'chopcook' (chop then cook).
// cookTime is the full cook duration in seconds at base stove speed;
// the green "perfect" zone is the middle 30% of the bar.
export const RECIPES = [
  {
    id: 'signal-sandwich', name: 'Signal Sandwich', level: 1, basePrice: 14,
    color: [0.85, 0.62, 0.30],
    components: [
      { ing: 'bread', prep: 'raw' },
      { ing: 'tomato', prep: 'chop' },
      { ing: 'cheese', prep: 'raw' },
    ],
  },
  {
    id: 'platform-salad', name: 'Platform Salad', level: 1, basePrice: 12,
    color: [0.35, 0.70, 0.25],
    components: [
      { ing: 'lettuce', prep: 'chop' },
      { ing: 'tomato', prep: 'chop' },
      { ing: 'carrot', prep: 'chop' },
    ],
  },
  {
    id: 'station-burger', name: 'Station Burger', level: 1, basePrice: 18,
    color: [0.55, 0.32, 0.18],
    components: [
      { ing: 'bread', prep: 'raw' },
      { ing: 'patty', prep: 'cook', cookTime: 8 },
      { ing: 'lettuce', prep: 'chop' },
    ],
  },
  {
    id: 'express-fries', name: 'Express Fries', level: 2, basePrice: 13,
    color: [0.95, 0.50, 0.10],
    components: [
      { ing: 'potato', prep: 'chopcook', cookTime: 7 },
      { ing: 'cheese', prep: 'raw' },
    ],
  },
  {
    id: 'mushroom-melt', name: 'Mushroom Melt', level: 3, basePrice: 20,
    color: [0.80, 0.70, 0.60],
    components: [
      { ing: 'bread', prep: 'raw' },
      { ing: 'mushroom', prep: 'cook', cookTime: 6 },
      { ing: 'cheese', prep: 'raw' },
    ],
  },
  {
    id: 'night-stew', name: 'Night Express Stew', level: 4, basePrice: 26,
    color: [0.70, 0.35, 0.10],
    components: [
      { ing: 'patty', prep: 'cook', cookTime: 9 },
      { ing: 'carrot', prep: 'chop' },
      { ing: 'potato', prep: 'chopcook', cookTime: 7 },
      { ing: 'mushroom', prep: 'chop' },
    ],
  },
  {
    id: 'golden-platter', name: 'Golden Junction Platter', level: 5, basePrice: 34,
    color: [0.98, 0.80, 0.20],
    components: [
      { ing: 'bread', prep: 'raw' },
      { ing: 'patty', prep: 'cook', cookTime: 9 },
      { ing: 'cheese', prep: 'raw' },
      { ing: 'tomato', prep: 'chop' },
      { ing: 'lettuce', prep: 'chop' },
    ],
  },
];

export function recipeById(id) {
  return RECIPES.find((r) => r.id === id) || null;
}
// Recipes a player at `level` may be ordered.
export function unlockedRecipes(level) {
  return RECIPES.filter((r) => r.level <= level);
}
// Ingredients a player at `level` may pick from the pantry.
export function unlockedIngredients(level) {
  const set = new Set(['bread', 'tomato', 'lettuce', 'carrot', 'cheese', 'patty']);
  if (level >= 2) set.add('potato');
  if (level >= 3) set.add('mushroom');
  return [...set];
}
// A component is ready when its prep steps are done. Returns the next
// prep step still needed ('chop' | 'cook' | null when ready).
export function nextPrepStep(component, state) {
  // state: { chopped: bool, cooked: bool, perfect: bool }
  if (component.prep === 'chop' || component.prep === 'chopcook') {
    if (!state.chopped) return 'chop';
  }
  if (component.prep === 'cook' || component.prep === 'chopcook') {
    if (!state.cooked) return 'cook';
  }
  return null;
}
export function componentReady(component, state) {
  return nextPrepStep(component, state) === null;
}
