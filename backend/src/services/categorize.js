/**
 * Merchant categorization: Bedrock when available, keyword rules otherwise.
 */
import { bedrockReady, invoke } from './ai.js';

export const CATEGORIES = ['Groceries', 'Dining', 'Transport', 'Shopping', 'Entertainment', 'Software', 'Health', 'Utilities', 'Travel', 'News', 'Other'];

const KEYWORDS = {
  Groceries: ['whole foods', 'trader joe', 'safeway', 'kroger', 'costco', 'walmart', 'market', 'grocery', 'hellofresh'],
  Dining: ['restaurant', 'cafe', 'coffee', 'starbucks', 'chipotle', 'pizza', 'burger', 'doordash', 'uber eats', 'grubhub', 'sushi', 'grill', 'kitchen', 'bar '],
  Transport: ['uber', 'lyft', 'gas', 'shell', 'chevron', 'parking', 'bart', 'metro', 'transit', 'toll'],
  Shopping: ['amazon', 'target', 'best buy', 'apple store', 'nike', 'electronics', 'mall'],
  Entertainment: ['netflix', 'hulu', 'spotify', 'disney', 'hbo', 'youtube', 'cinema', 'theater', 'steam', 'playstation', 'xbox'],
  Software: ['adobe', 'icloud', 'apple.com/bill', 'google one', 'microsoft', 'github', 'notion', 'dropbox', 'openai', 'chatgpt'],
  Health: ['cvs', 'walgreens', 'pharmacy', 'gym', 'fitness', 'peloton', 'clinic', 'dental'],
  Utilities: ['electric', 'pg&e', 'water', 'comcast', 'xfinity', 'verizon', 'at&t', 't-mobile', 'internet'],
  Travel: ['airline', 'united', 'delta', 'airbnb', 'hotel', 'marriott', 'hilton', 'expedia'],
  News: ['nyt', 'times', 'wsj', 'post', 'substack', 'medium'],
};

export function categorizeByRules(merchant, items = []) {
  const hay = `${merchant} ${items.join(' ')}`.toLowerCase();
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => hay.includes(w))) return cat;
  }
  return 'Other';
}

export async function categorize(merchant, items = []) {
  if (bedrockReady()) {
    try {
      const answer = (await invoke(
        `Classify a purchase into exactly one of these categories: ${CATEGORIES.join(', ')}. Reply with the category name only.`,
        `Merchant: ${merchant}\nItems: ${items.slice(0, 10).join(', ') || 'unknown'}`,
        { maxTokens: 10, temperature: 0 },
      )).trim();
      const match = CATEGORIES.find((c) => answer.toLowerCase().includes(c.toLowerCase()));
      if (match) return { category: match, source: 'bedrock' };
    } catch (err) {
      console.warn('[categorize] Bedrock unavailable, using rules:', err.message);
    }
  }
  return { category: categorizeByRules(merchant, items), source: 'rules' };
}
