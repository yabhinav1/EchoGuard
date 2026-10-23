/**
 * Alexa Skills Kit request handler. No SDK; handles the raw request JSON.
 * Alexa user IDs are mapped to EchoGuard users via ALEXA_USER_MAP ("amzn1.ask.account.X=userId,...").
 * Unmapped users fall back to the demo account so the skill works out of the box.
 * When ALEXA_SKILL_ID is set, requests from any other skill are rejected.
 */
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

export async function handleAlexaRequest(request) {
  const appId = request.session?.application?.applicationId || request.context?.System?.application?.applicationId;
  if (SKILL_ID && appId !== SKILL_ID) {
    throw Object.assign(new Error('Request is not from the configured Alexa skill'), { status: 403 });
  }
  const type = request.request?.type;
  const userId = resolveUser(request);

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
