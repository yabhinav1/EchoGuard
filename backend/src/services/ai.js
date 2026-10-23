/**
 * LLM layer. Uses Amazon Bedrock (Claude) when AWS credentials + region are available.
 * Falls back to a rule-based responder in demo mode so the app works offline.
 */
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-haiku-20241022-v1:0';
const REGION = process.env.AWS_REGION || 'us-east-1';

const BEDROCK_ENABLED = process.env.USE_BEDROCK === 'true' || !!process.env.TABLE_NAME;
const RETRY_AFTER_MS = 60 * 1000; // after a failure, use the fallback for a minute, then try Bedrock again

let bedrock = null;
let downUntil = 0;

/** True when Bedrock is configured and not in its post-failure cooldown. */
export const bedrockReady = () => BEDROCK_ENABLED && Date.now() >= downUntil;

async function getClient() {
  if (bedrock) return bedrock;
  const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
  bedrock = new BedrockRuntimeClient({ region: REGION });
  return bedrock;
}

export async function invoke(system, userMessage, { maxTokens = 600, temperature = 0.3 } = {}) {
  try {
    const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const res = await (await getClient()).send(new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: userMessage }] }],
      inferenceConfig: { maxTokens, temperature },
    }));
    return res.output.message.content.map((c) => c.text || '').join('');
  } catch (err) {
    downUntil = Date.now() + RETRY_AFTER_MS;
    throw err;
  }
}

function buildContext({ summary, subscriptions, anomalies, tips, categoryTotals }) {
  return JSON.stringify({
    summary,
    subscriptions: subscriptions.map(({ transactionIds, ...s }) => s),
    anomalies: anomalies.map((a) => ({ type: a.type, severity: a.severity, reason: a.reason, date: a.transaction.date })),
    savingsTips: tips,
    spendByCategoryLast30Days: categoryTotals,
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
        { maxTokens: 400 },
      );
      return { text, source: 'bedrock' };
    } catch (err) {
      console.warn('[ai] Bedrock unavailable for digest:', err.message);
    }
  }
  const { summary, anomalies, tips } = context;
  const lines = [
    `Hi! Here's your EchoGuard weekly digest.`,
    `You have ${summary.activeCount} active subscriptions costing $${summary.monthlyTotal}/month ($${summary.yearlyTotal}/year).`,
    summary.renewingSoon.length
      ? `Renewing in the next 7 days: ${summary.renewingSoon.map((s) => `${s.merchant} ($${s.amount})`).join(', ')}.`
      : `Nothing renews in the next 7 days.`,
    anomalies.length ? `Heads up: ${anomalies[0].reason}` : `No unusual spending detected.`,
    tips.length ? `Top savings tip: ${tips[0].title}. ${tips[0].detail}` : '',
  ].filter(Boolean);
  return { text: lines.join('\n\n'), source: 'rules' };
}

// ---- Demo-mode responder --------------------------------------------------
function ruleBasedAnswer(q, { summary, subscriptions, anomalies, tips, categoryTotals }) {
  const s = q.toLowerCase();
  const money = (n) => `$${Number(n).toFixed(2)}`;

  if (/cancel|save|saving|cut|reduce/.test(s)) {
    if (!tips.length) return 'I could not find obvious savings right now. Your subscriptions look lean.';
    return `Here is where you could save:\n` + tips.slice(0, 3).map((t) => `• ${t.title}: ${t.detail}`).join('\n');
  }
  if (/renew|upcoming|due|next/.test(s)) {
    const soon = subscriptions.filter((x) => x.status === 'active' && x.daysUntilRenewal >= 0).sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal).slice(0, 5);
    return `Upcoming renewals:\n` + soon.map((x) => `• ${x.merchant}: ${money(x.amount)} in ${x.daysUntilRenewal} day${x.daysUntilRenewal === 1 ? '' : 's'} (${x.nextRenewal})`).join('\n');
  }
  if (/unusual|anomal|weird|suspicious|fraud|strange/.test(s)) {
    if (!anomalies.length) return 'Nothing unusual in your recent spending.';
    return `I found ${anomalies.length} unusual item${anomalies.length > 1 ? 's' : ''}:\n` + anomalies.slice(0, 4).map((a) => `• [${a.severity}] ${a.reason}`).join('\n');
  }
  if (/price|increase|hike|raise/.test(s)) {
    const hikes = summary.priceHikes;
    return hikes.length
      ? hikes.map((h) => `${h.merchant} went from ${money(h.priceChange.from)} to ${money(h.priceChange.to)} (+${h.priceChange.pct.toFixed(0)}%).`).join('\n')
      : 'No price increases detected.';
  }
  for (const [cat, total] of Object.entries(categoryTotals)) {
    if (s.includes(cat.toLowerCase())) return `You spent ${money(total)} on ${cat} in the last 30 days.`;
  }
  if (/subscription|recurring|how many|total|month/.test(s)) {
    return `You have ${summary.activeCount} active subscriptions totalling ${money(summary.monthlyTotal)}/month. The biggest are ` +
      subscriptions.filter((x) => x.status === 'active').slice(0, 3).map((x) => `${x.merchant} (${money(x.monthlyCost)}/mo)`).join(', ') + '.';
  }
  return `I can help with subscriptions, renewals, unusual spending, price hikes, savings, or spend by category (${Object.keys(categoryTotals).join(', ')}). Try asking "what can I cancel?"`;
}
