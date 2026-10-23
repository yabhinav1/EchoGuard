/**
 * Cancellation help for a detected subscription: where to cancel, the steps, and a ready-to-send
 * cancellation request. Template-based on purpose (no LLM call, so it costs nothing to run).
 */
const GUIDES = [
  { match: ['netflix'], url: 'https://www.netflix.com/cancelplan', steps: ['Sign in to Netflix on the web', 'Open Account and choose Cancel membership', 'Confirm with Finish cancellation'] },
  { match: ['hulu'], url: 'https://secure.hulu.com/account', steps: ['Sign in to Hulu on the web', 'Open Account and select Cancel under Your Subscription', 'Skip the offers and confirm the cancellation'] },
  { match: ['spotify'], url: 'https://www.spotify.com/account/subscription/', steps: ['Sign in at spotify.com', 'Open Manage your plan', 'Choose Cancel Premium and confirm'] },
  { match: ['youtube'], url: 'https://www.youtube.com/paid_memberships', steps: ['Open YouTube purchases and memberships', 'Select the membership and choose Deactivate', 'Confirm Continue to cancel'] },
  { match: ['adobe'], url: 'https://account.adobe.com/plans', steps: ['Sign in to your Adobe account', 'Open Plans and choose Manage plan', 'Select Cancel your plan; check for an early-termination fee on annual plans'] },
  { match: ['planet fitness'], method: 'letter', url: 'https://www.planetfitness.com/my-account', steps: ['Planet Fitness usually requires cancelling in person at your home club or by certified letter', 'Send the letter below to your home club, or bring it in person', 'Keep the receipt or tracking number as proof'] },
  { match: ['peloton'], url: 'https://members.onepeloton.com/preferences/subscriptions', steps: ['Sign in to your Peloton account on the web', 'Open Subscriptions and select the App membership', 'Choose Cancel subscription and confirm'] },
  { match: ['amazon prime'], url: 'https://www.amazon.com/gp/primecentral', steps: ['Open Prime membership settings', 'Choose Manage membership, then End membership', 'Confirm; unused yearly Prime may be eligible for a partial refund'] },
  { match: ['apple', 'icloud'], url: 'https://apps.apple.com/account/subscriptions', steps: ['On iPhone: Settings, tap your name, then Subscriptions', 'Select the subscription and tap Cancel Subscription', 'For iCloud+: Settings, your name, iCloud, Manage Account Storage, Change Storage Plan, Downgrade'] },
  { match: ['google one'], url: 'https://one.google.com/settings', steps: ['Open Google One settings', 'Choose Cancel membership', 'Confirm; storage drops to the free 15 GB'] },
  { match: ['nyt', 'new york times'], url: 'https://myaccount.nytimes.com/', steps: ['Sign in to your NYT account', 'Open Subscription overview and choose Cancel your subscription', 'Follow the prompts or use the chat option if asked'] },
  { match: ['hellofresh'], url: 'https://www.hellofresh.com/account-settings', steps: ['Sign in to HelloFresh', 'Open Account settings, then Plan settings', 'Choose Cancel plan before the weekly cutoff to avoid the next box'] },
  { match: ['disney'], url: 'https://www.disneyplus.com/account', steps: ['Sign in to Disney+ on the web', 'Open Account and select your subscription', 'Choose Cancel subscription and confirm'] },
  { match: ['dropbox'], url: 'https://www.dropbox.com/account/plan', steps: ['Sign in to Dropbox on the web', 'Open Settings, then Plan', 'Choose Cancel plan and confirm'] },
  { match: ['microsoft', 'xbox'], url: 'https://account.microsoft.com/services', steps: ['Sign in to your Microsoft account', 'Open Services & subscriptions', 'Choose Manage, then Cancel subscription'] },
];

const fmtDate = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function cancelGuide(sub) {
  const name = sub.merchant.toLowerCase();
  const guide = GUIDES.find((g) => g.match.some((m) => name.includes(m)));
  const method = guide?.method || 'online';
  const amount = `$${sub.amount.toFixed(2)}`;
  const steps = [...(guide?.steps || [
    `Sign in to your ${sub.merchant} account`,
    'Open Account, Billing or Subscription settings',
    'Choose Cancel and confirm',
    'Save the confirmation email or a screenshot',
  ])]; // copy: the shared guide list must not grow on every call
  steps.push(`Check that no ${amount} charge appears on ${fmtDate(sub.nextRenewal)}`);

  const subject = `Cancel my ${sub.merchant} subscription`;
  const body = [
    method === 'letter' ? `To the ${sub.merchant} membership team,` : `Hello ${sub.merchant} support,`,
    '',
    `Please cancel my ${sub.cadence} ${sub.merchant} subscription (currently ${amount}) effective immediately, and do not charge me at the next renewal on ${fmtDate(sub.nextRenewal)}.`,
    'Please confirm the cancellation in writing and that no further charges will be made.',
    '',
    'Name: [your name]',
    'Account email: [your email]',
    '',
    'Thank you.',
  ].join('\n');

  return {
    subscriptionId: sub.id,
    merchant: sub.merchant,
    method,
    known: !!guide,
    url: guide?.url || `https://www.google.com/search?q=${encodeURIComponent(`how to cancel ${sub.merchant} subscription`)}`,
    steps,
    request: { subject, body },
    monthlySaving: sub.monthlyCost,
    yearlySaving: +(sub.monthlyCost * 12).toFixed(2),
  };
}
