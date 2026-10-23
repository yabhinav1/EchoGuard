/**
 * Alexa Skills Kit request handler. No SDK; handles the raw request JSON.
 * Alexa user IDs are mapped to EchoGuard users via ALEXA_USER_MAP ("amzn1.ask.account.X=userId,...").
 * Unmapped users fall back to the demo account so the skill works out of the box.
 * When ALEXA_SKILL_ID is set, requests from any other skill are rejected.
 */
import { readFileSync } from 'node:fs';
import { analyzeUser } from './analysis.js';
import { chat } from './ai.js';

const say = (text, { end = true, reprompt } = {}) => ({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text },
    ...(reprompt ? { reprompt: { outputSpeech: { type: 'PlainText', text: reprompt } } } : {}),
    shouldEndSession: end,
  },
});

const money = (n) => `$${Number(n).toFixed(2)}`;
const list = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr.at(-1)}`);

function resolveUser(request) {
  const alexaId = request.session?.user?.userId || request.context?.System?.user?.userId;
  const map = Object.fromEntries((process.env.ALEXA_USER_MAP || '').split(',').filter(Boolean).map((p) => p.split('=')));
  return map[alexaId] || 'demo';
}

// The Lambda permission is also scoped to this skill (see infra/template.yaml); this is the in-code check.
const SKILL_ID = process.env.ALEXA_SKILL_ID;
if (!SKILL_ID && process.env.TABLE_NAME) console.warn('[alexa] ALEXA_SKILL_ID is not set; accepting requests from any skill');

/** `userId` overrides the Alexa account mapping (used by the in-browser simulator). */
export async function handleAlexaRequest(request, { userId: forUser } = {}) {
  const appId = request.session?.application?.applicationId || request.context?.System?.application?.applicationId;
  if (SKILL_ID && appId !== SKILL_ID) {
    throw Object.assign(new Error('Request is not from the configured Alexa skill'), { status: 403 });
  }
  const type = request.request?.type;
  const userId = forUser || resolveUser(request);

  if (type === 'LaunchRequest') {
    return say('Welcome to EchoGuard. You can ask about your subscriptions, upcoming renewals, unusual charges, or how to save money. What would you like to know?', { end: false, reprompt: 'Try asking: what renews this week?' });
  }
  if (type === 'SessionEndedRequest') return say('');
  if (type !== 'IntentRequest') return say('Sorry, I did not understand that.');

  const intent = request.request.intent?.name;
  const slots = request.request.intent?.slots || {};
  const data = await analyzeUser(userId);
  const { summary, subscriptions, anomalies, tips, budgets } = data;

  switch (intent) {
    case 'SubscriptionsIntent': {
      const top = subscriptions.filter((s) => s.status === 'active').slice(0, 3).map((s) => `${s.merchant} at ${money(s.monthlyCost)} a month`);
      return say(`You have ${summary.activeCount} active subscriptions costing ${money(summary.monthlyTotal)} a month, or ${money(summary.yearlyTotal)} a year. The biggest are ${list(top)}.`);
    }
    case 'RenewalsIntent': {
      const soon = subscriptions.filter((s) => s.status === 'active' && s.daysUntilRenewal >= 0 && s.daysUntilRenewal <= 7);
      if (!soon.length) return say('Nothing renews in the next seven days.');
      return say(`${soon.length} ${soon.length === 1 ? 'subscription renews' : 'subscriptions renew'} this week: ${list(soon.map((s) => `${s.merchant} for ${money(s.amount)} in ${s.daysUntilRenewal} day${s.daysUntilRenewal === 1 ? '' : 's'}`))}.`);
    }
    case 'AnomaliesIntent': {
      if (!anomalies.length) return say('I did not find anything unusual in your recent spending.');
      return say(`I found ${anomalies.length} unusual ${anomalies.length === 1 ? 'charge' : 'charges'}. ${anomalies.slice(0, 2).map((a) => a.reason).join(' ')}`);
    }
    case 'SavingsIntent': {
      if (!tips.length) return say('Your subscriptions look lean. I have no savings suggestions right now.');
      const total = tips.reduce((s, t) => s + t.monthlySaving, 0);
      return say(`You could save up to ${money(total)} a month. ${tips[0].title}. ${tips[0].detail}`);
    }
    case 'ForecastIntent': {
      const f = data.forecast;
      const next = f.renewals[0];
      return say(`Over the next ${f.days} days you're on track to spend about ${money(f.total)}: ${money(f.subscriptions)} in subscription renewals and ${money(f.everyday)} in everyday spending.${next ? ` The next renewal is ${next.merchant} for ${money(next.amount)}.` : ''}`);
    }
    case 'BudgetIntent': {
      const cat = slots.category?.value;
      const b = cat ? budgets.find((x) => x.category.toLowerCase() === cat.toLowerCase()) : null;
      if (b) return say(`You have spent ${money(b.spent)} of your ${money(b.limit)} ${b.category} budget this month, which is ${b.pct} percent.`);
      const worst = budgets[0];
      return say(worst ? `Your tightest budget is ${worst.category} at ${worst.pct} percent used, ${money(worst.spent)} of ${money(worst.limit)}.` : 'You have no budgets set up yet.');
    }
    case 'AskIntent': {
      const q = slots.question?.value;
      if (!q) return say('What would you like to know?', { end: false });
      const { answer } = await chat(q, data);
      return say(answer.replace(/[•*#\n]+/g, ' ').slice(0, 600));
    }
    case 'AMAZON.HelpIntent':
      return say('You can ask: what are my subscriptions, what renews this week, anything unusual, how can I save, or how is my dining budget.', { end: false });
    case 'AMAZON.StopIntent':
    case 'AMAZON.CancelIntent':
      return say('Goodbye.');
    default:
      return say('Sorry, I can help with subscriptions, renewals, unusual charges, savings, and budgets.', { end: false });
  }
}

// ---- In-browser simulator ------------------------------------------------------
// Maps a typed or spoken utterance to an intent using the skill's own sample utterances, then runs
// the same handler a real Echo device would reach. Lets people try the skill without a device.
const MODEL = JSON.parse(readFileSync(new URL('../../alexa/interaction-model.json', import.meta.url), 'utf8')).interactionModel.languageModel;
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9{} ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (t) => new Set(norm(t).split(' ').filter(Boolean));

export function matchUtterance(utterance) {
  // "Alexa, ask Money Guard to ..." -> "..." (the old "Echo Guard" name is still understood)
  const u = norm(utterance).replace(/^alexa /, "")
    .replace(/^(ask|tell|open|launch|start) (echo ?|money )guard\b/, "").replace(/^ (to|about|for)\b/, "").trim();
  if (!u) return { type: 'LaunchRequest' };
  if (/^(help|what can you do|what can i say)$/.test(u)) return { type: 'IntentRequest', intent: 'AMAZON.HelpIntent', slots: {} };
  if (/^(stop|cancel|never mind|goodbye|bye)$/.test(u)) return { type: 'IntentRequest', intent: 'AMAZON.StopIntent', slots: {} };

  let best = { score: 0 };
  for (const intent of MODEL.intents) {
    for (const sample of intent.samples || []) {
      if (sample.includes('{')) {
        const re = new RegExp('^' + norm(sample).replace(/\{(\w+)\}/g, '(?<$1>.+)') + '$');
        const hit = u.match(re);
        if (hit) return { type: 'IntentRequest', intent: intent.name, slots: { ...hit.groups } };
        continue;
      }
      const a = words(sample); const b = words(u);
      const overlap = [...a].filter((w) => b.has(w)).length;
      const score = overlap / new Set([...a, ...b]).size;
      if (score > best.score) best = { score, intent: intent.name };
    }
  }
  if (best.score >= 0.6) return { type: 'IntentRequest', intent: best.intent, slots: {}, confidence: +best.score.toFixed(2) };
  return { type: 'IntentRequest', intent: 'AskIntent', slots: { question: u } }; // free-form: answered by the assistant
}

export async function simulateUtterance(utterance, userId) {
  const m = matchUtterance(utterance || '');
  const request = {
    version: '1.0',
    session: { application: { applicationId: process.env.ALEXA_SKILL_ID || 'amzn1.ask.skill.simulator' }, user: { userId: 'simulator' } },
    request: m.type === 'LaunchRequest'
      ? { type: 'LaunchRequest' }
      : { type: 'IntentRequest', intent: { name: m.intent, slots: Object.fromEntries(Object.entries(m.slots).map(([k, v]) => [k, { name: k, value: v }])) } },
  };
  const response = await handleAlexaRequest(request, { userId });
  return { utterance, matched: m, request, response, speech: response.response.outputSpeech.text };
}
