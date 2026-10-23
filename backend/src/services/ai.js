/**
 * Assistant layer. A built-in rule-based responder answers from the user's own analysis at no cost.
 * Amazon Bedrock (Claude) is optional: set USE_BEDROCK=true to use it, with the rules as fallback.
 */
import { cancelGuide } from './cancelGuide.js';

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-haiku-5-5';
const REGION = process.env.AWS_REGION || 'us-east-1';

const BEDROCK_ENABLED = process.env.USE_BEDROCK === 'true';
const RETRY_AFTER_MS = 60 * 1000; // after a failure, use the fallback for a minute, then try Bedrock again

let bedrock = null;
let downUntil = 0;

/** True when Bedrock is turned on and not in its post-failure cooldown. */
export const bedrockReady = () => BEDROCK_ENABLED && Date.now() >= downUntil;

async function getClient() {
  if (bedrock) return bedrock;
  const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
  bedrock = new BedrockRuntimeClient({ region: REGION });
  return bedrock;
}

// Current Claude models reject sampling parameters (temperature/top_p) and think before answering,
// so leave room in maxTokens for that reasoning on top of the reply.
export async function invoke(system, userMessage, { maxTokens = 2000 } = {}) {
  try {
    const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const res = await (await getClient()).send(new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: userMessage }] }],
      inferenceConfig: { maxTokens },
    }));
    return res.output.message.content.map((c) => c.text || '').join('');
  } catch (err) {
    downUntil = Date.now() + RETRY_AFTER_MS;
    throw err;
  }
}

function buildContext({ summary, subscriptions, anomalies, tips, categoryTotals, budgets, forecast }) {
  return JSON.stringify({
    summary,
    subscriptions: subscriptions.map(({ transactionIds, ...s }) => s),
    anomalies: anomalies.map((a) => ({ type: a.type, severity: a.severity, reason: a.reason, date: a.transaction.date })),
    savingsTips: tips,
    spendByCategoryLast30Days: categoryTotals,
    budgetsThisMonth: budgets,
    next30DaysForecast: forecast && { total: forecast.total, subscriptions: forecast.subscriptions, everyday: forecast.everyday },
  }, null, 0);
}

const SYSTEM = `You are EchoGuard, a friendly personal finance assistant. You answer questions about the user's
subscriptions, recurring payments, and spending using ONLY the JSON context provided. Be concise, use dollar
amounts, and give concrete next steps. If the context does not contain the answer, say so. Never invent transactions.`;

export async function chat(question, context) {
  if (bedrockReady()) {
    try {
      return { answer: await invoke(SYSTEM, `Context:\n${buildContext(context)}\n\nQuestion: ${question}`), source: 'bedrock' };
    } catch (err) {
      console.warn('[ai] Bedrock unavailable, falling back to rules:', err.message);
    }
  }
  return { answer: ruleBasedAnswer(question, context), source: 'rules' };
}

export async function weeklyDigest(context) {
  if (bedrockReady()) {
    try {
      const text = await invoke(
        SYSTEM + ' Write a short, warm weekly email digest (under 150 words) with: total monthly subscription cost, renewals in the next 7 days, any anomalies, and the single best savings tip.',
        `Context:\n${buildContext(context)}`,
      );
      return { text, source: 'bedrock' };
    } catch (err) {
      console.warn('[ai] Bedrock unavailable for digest:', err.message);
    }
  }
  const { summary, anomalies, tips, forecast } = context;
  const lines = [
    `Hi! Here's your EchoGuard weekly digest.`,
    `You have ${summary.activeCount} active subscriptions costing $${summary.monthlyTotal}/month ($${summary.yearlyTotal}/year).`,
    summary.renewingSoon.length
      ? `Renewing in the next 7 days: ${summary.renewingSoon.map((s) => `${s.merchant} ($${s.amount})`).join(', ')}.`
      : `Nothing renews in the next 7 days.`,
    forecast ? `Next 30 days: about $${forecast.total.toFixed(2)} going out ($${forecast.subscriptions.toFixed(2)} in renewals).` : '',
    anomalies.length ? `Heads up: ${anomalies[0].reason}` : `No unusual spending detected.`,
    tips.length ? `Top savings tip: ${tips[0].title}. ${tips[0].detail}` : '',
  ].filter(Boolean);
  return { text: lines.join('\n\n'), source: 'rules' };
}

// ---- Built-in responder ------------------------------------------------------
const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const when = (d) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
const fmtDay = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Finds a subscription the question names, e.g. "netflix" or "youtube music". */
function mentionedSubscription(s, subscriptions) {
  return subscriptions
    .map((x) => ({ x, words: x.merchant.toLowerCase().split(/\s+/).filter((w) => w.length > 2) }))
    .filter(({ words }) => words.length && words.every((w) => s.includes(w)) || (words[0] && words[0].length > 3 && s.includes(words[0])))
    .sort((a, b) => b.words.length - a.words.length)[0]?.x;
}

export function ruleBasedAnswer(q, ctx) {
  const { summary, subscriptions, anomalies, tips, categoryTotals, budgets = [], forecast } = ctx;
  const s = q.toLowerCase().replace(/[?!.]/g, ' ');
  const active = subscriptions.filter((x) => x.status === 'active');
  const has = (re) => re.test(s);

  if (has(/^\s*(hi|hello|hey|yo|good (morning|afternoon|evening))\b/)) {
    return `Hi! You have ${plural(summary.activeCount, 'active subscription')} costing ${money(summary.monthlyTotal)} a month. Ask me what you can cancel, what renews next, or whether anything looks unusual.`;
  }
  if (has(/\b(thanks|thank you|thx)\b/)) return 'Anytime. I keep watching your charges and will flag anything new.';
  if (has(/\b(help|what can you do|what can i ask)\b/)) {
    return 'Try asking:\n• What can I cancel?\n• What renews this week?\n• Anything unusual?\n• How much will I spend this month?\n• How is my dining budget?\n• How much is Netflix?\n• How do I cancel Hulu?';
  }

  // A specific service: price, renewal, or how to cancel it
  const sub = mentionedSubscription(s, subscriptions);
  if (sub) {
    if (has(/cancel|stop|get rid|unsubscribe/)) {
      const g = cancelGuide(sub);
      return `To cancel ${sub.merchant} (saves ${money(g.monthlySaving)}/month, ${money(g.yearlySaving)}/year):\n` +
        g.steps.map((st, i) => `${i + 1}. ${st}`).join('\n') + `\nCancel page: ${g.url}\nTip: use the Cancel button on the Subscriptions page for a ready-to-send cancellation request.`;
    }
    if (sub.status !== 'active') return `${sub.merchant} looks ${sub.status === 'cancelled' ? 'cancelled (you marked it)' : 'cancelled: the last charge was ' + sub.lastCharged.slice(0, 10) + ' and it has not renewed since'}.`;
    const hike = sub.priceChange?.pct > 0 ? ` Heads up: the price went up ${sub.priceChange.pct.toFixed(0)}% from ${money(sub.priceChange.from)}.` : '';
    return `${sub.merchant} costs ${money(sub.amount)} ${sub.cadence} (${money(sub.monthlyCost)}/month, ${money(sub.monthlyCost * 12)}/year). It renews ${when(sub.daysUntilRenewal)} on ${fmtDay(sub.nextRenewal)}.${hike}`;
  }

  if (has(/cancel|save|saving|cut|reduce|cheaper|lower my/)) {
    if (!tips.length) return 'I could not find obvious savings right now. Your subscriptions look lean.';
    const total = tips.reduce((sum, t) => sum + t.monthlySaving, 0);
    return `You could save up to ${money(total)}/month (${money(total * 12)}/year):\n` + tips.filter((t) => t.monthlySaving > 0).slice(0, 4).map((t) => `• ${t.title}: ${t.detail}`).join('\n');
  }
  if (has(/forecast|will i spend|going to spend|going out|next (30|thirty) days|rest of the month|cash ?flow/)) {
    if (!forecast) return 'I need a little more history to forecast your spending.';
    const next = forecast.renewals.slice(0, 3).map((r) => `${r.merchant} ${money(r.amount)} on ${fmtDay(r.date)}`).join(', ');
    return `Over the next ${forecast.days} days you're on track to spend about ${money(forecast.total)}: ${money(forecast.subscriptions)} in subscription renewals and ${money(forecast.everyday)} in everyday spending (about ${money(forecast.dailyEveryday)}/day).` + (next ? `\nNext renewals: ${next}.` : '');
  }
  if (has(/renew|upcoming|due|next payment|this week|coming up/)) {
    const soon = active.filter((x) => x.daysUntilRenewal >= 0).sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal).slice(0, 5);
    if (!soon.length) return 'Nothing is due to renew soon.';
    return `Upcoming renewals:\n` + soon.map((x) => `• ${x.merchant}: ${money(x.amount)} ${when(x.daysUntilRenewal)} (${fmtDay(x.nextRenewal)})`).join('\n');
  }
  if (has(/unusual|anomal|weird|suspicious|fraud|strange|twice|duplicate|scam/)) {
    if (!anomalies.length) return 'Nothing unusual in your recent spending.';
    return `I found ${plural(anomalies.length, 'unusual item')}:\n` + anomalies.slice(0, 4).map((a) => `• [${a.severity}] ${a.reason}`).join('\n');
  }
  if (has(/price|increase|hike|raise|went up/)) {
    const hikes = summary.priceHikes;
    return hikes.length
      ? hikes.map((h) => `${h.merchant} went from ${money(h.priceChange.from)} to ${money(h.priceChange.to)} (+${h.priceChange.pct.toFixed(0)}%).`).join('\n')
      : 'No price increases detected.';
  }
  if (has(/budget|over spend|overspend|left to spend/)) {
    const b = budgets.find((x) => s.includes(x.category.toLowerCase()));
    if (b) return `${b.category}: ${money(b.spent)} of ${money(b.limit)} this month (${b.pct}%). ${b.state === 'over' ? 'You are over budget.' : b.state === 'warning' ? 'You are close to the limit.' : b.state === 'pace' ? `At this pace you'll reach about ${money(b.projected)} by month end.` : 'On track.'}`;
    if (!budgets.length) return 'You have no budgets set up yet. Add some on the Budgets page.';
    const flagged = budgets.filter((x) => x.state !== 'ok');
    return flagged.length
      ? `Budgets to watch this month:\n` + flagged.map((x) => `• ${x.category}: ${money(x.spent)} of ${money(x.limit)} (${x.pct}%)`).join('\n')
      : 'All your budgets are on track this month.';
  }
  for (const [cat, total] of Object.entries(categoryTotals)) {
    if (s.includes(cat.toLowerCase())) return `You spent ${money(total)} on ${cat} in the last 30 days.`;
  }
  if (has(/biggest|most expensive|largest|priciest|expensive/)) {
    const top = [...active].sort((a, b) => b.monthlyCost - a.monthlyCost).slice(0, 3);
    return `Your most expensive subscriptions: ` + top.map((x) => `${x.merchant} (${money(x.monthlyCost)}/mo)`).join(', ') + '.';
  }
  if (has(/year|annual/)) {
    return `Your active subscriptions cost ${money(summary.yearlyTotal)} a year (${money(summary.monthlyTotal)}/month).`;
  }
  if (has(/subscription|recurring|how many|paying for/)) {
    return `You have ${plural(summary.activeCount, 'active subscription')} totalling ${money(summary.monthlyTotal)}/month. The biggest are ` +
      [...active].sort((a, b) => b.monthlyCost - a.monthlyCost).slice(0, 3).map((x) => `${x.merchant} (${money(x.monthlyCost)}/mo)`).join(', ') + '.';
  }
  if (has(/spen[dt]|total|how much/)) {
    return `You spent ${money(summary.last30DaysSpend)} in the last 30 days. Top categories: ` +
      Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, t]) => `${c} ${money(t)}`).join(', ') + '.';
  }
  return `I can help with subscriptions, renewals, unusual charges, price hikes, savings, budgets, your 30-day forecast, or spend by category (${Object.keys(categoryTotals).join(', ')}). Try "what can I cancel?" or "how much is Netflix?"`;
}
