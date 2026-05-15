const CATEGORY_GUIDES = {
  Textbooks: {
    label: 'textbooks and study material',
    sourceCategory: 'Education and recreation reading material',
    baseRange: [180, 650],
    keywords: [
      { terms: ['textbook', 'economics', 'calculus', 'accounting', 'biology', 'chemistry', 'physics'], range: [220, 780] },
      { terms: ['notes', 'study guide', 'memo', 'summary'], range: [50, 220] },
    ],
  },
  Electronics: {
    label: 'student electronics',
    sourceCategory: 'Household appliances, communication equipment, and recreation equipment',
    baseRange: [250, 2200],
    keywords: [
      { terms: ['laptop', 'notebook', 'macbook'], range: [2200, 8500] },
      { terms: ['phone', 'iphone', 'samsung'], range: [900, 6000] },
      { terms: ['calculator', 'casio', 'scientific'], range: [180, 650] },
      { terms: ['headphones', 'earphones', 'speaker'], range: [120, 900] },
      { terms: ['charger', 'cable', 'adapter'], range: [60, 280] },
    ],
  },
  Furniture: {
    label: 'student furniture',
    sourceCategory: 'Furnishings and household equipment',
    baseRange: [180, 1800],
    keywords: [
      { terms: ['desk', 'table'], range: [350, 1800] },
      { terms: ['chair'], range: [180, 900] },
      { terms: ['bed', 'mattress'], range: [600, 2800] },
      { terms: ['lamp'], range: [80, 450] },
    ],
  },
  Clothing: {
    label: 'clothing and footwear',
    sourceCategory: 'Clothing and footwear',
    baseRange: [60, 450],
    keywords: [
      { terms: ['jacket', 'coat', 'hoodie'], range: [150, 800] },
      { terms: ['shoes', 'sneakers', 'boots'], range: [180, 950] },
      { terms: ['shirt', 'top', 'pants', 'jeans'], range: [80, 450] },
    ],
  },
  'Notes & Study': {
    label: 'study notes and academic material',
    sourceCategory: 'Education and stationery-related products',
    baseRange: [40, 250],
    keywords: [
      { terms: ['bundle', 'pack'], range: [90, 350] },
      { terms: ['notes', 'summary', 'memo'], range: [40, 220] },
    ],
  },
  Other: {
    label: 'general student items',
    sourceCategory: 'Mixed household consumer goods',
    baseRange: [80, 650],
    keywords: [],
  },
};

const CONDITION_MULTIPLIERS = {
  New: 1,
  'Like New': 0.82,
  Good: 0.65,
  Fair: 0.48,
  Used: 0.55,
};

function roundToNearestTen(value) {
  return Math.max(0, Math.round(value / 10) * 10);
}

function matchKeywordRange(title, guide) {
  const cleanTitle = String(title || '').toLowerCase();
  return guide.keywords.find(item => item.terms.some(term => cleanTitle.includes(term)));
}

export function getPriceSuggestion({ title = '', category = 'Other', condition = 'Used' } = {}) {
  const guide = CATEGORY_GUIDES[category] || CATEGORY_GUIDES.Other;
  const keywordMatch = matchKeywordRange(title, guide);
  const range = keywordMatch?.range || guide.baseRange;
  const multiplier = CONDITION_MULTIPLIERS[condition] || CONDITION_MULTIPLIERS.Used;
  const low = roundToNearestTen(range[0] * multiplier);
  const high = Math.max(low + 20, roundToNearestTen(range[1] * multiplier));
  const midpoint = roundToNearestTen((low + high) / 2);

  return {
    low,
    high,
    midpoint,
    label: guide.label,
    sourceCategory: guide.sourceCategory,
    confidence: keywordMatch ? 'strong' : 'category',
  };
}
