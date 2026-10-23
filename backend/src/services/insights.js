/**
 * Rule-based savings suggestions. Used directly, and also fed to the LLM as context.
 */
const OVERLAP_GROUPS = {
  music: ['spotify', 'apple music', 'youtube music', 'tidal', 'amazon music'],
  video: ['netflix', 'hulu', 'disney', 'hbo max', 'max', 'paramount', 'peacock', 'apple tv', 'prime video'],
  cloud_storage: ['dropbox', 'google one', 'icloud', 'onedrive'],
  fitness: ['peloton', 'strava', 'fitbod', 'apple fitness', 'nike training'],
};

export function suggestSavings(subscriptions) {
  const tips = [];
  const active = subscriptions.filter((s) => s.status === 'active');

  for (const [group, names] of Object.entries(OVERLAP_GROUPS)) {
    const matches = active.filter((s) => names.some((n) => s.merchant.toLowerCase().includes(n)));
    if (matches.length > 1) {
      // Never suggest dropping something the user marked "keep"; otherwise keep the cheapest
      const kept = matches.filter((m) => m.userStatus === 'keep');
      const keeper = kept[0] || matches.reduce((a, b) => (a.monthlyCost < b.monthlyCost ? a : b));
      const others = matches.filter((m) => m !== keeper && m.userStatus !== 'keep');
      if (!others.length) continue;
      const saving = others.reduce((sum, m) => sum + m.monthlyCost, 0);
      tips.push({
        type: 'overlap',
        title: `You pay for ${matches.length} ${group.replace('_', ' ')} services`,
        detail: kept.length
          ? `${matches.map((m) => m.merchant).join(', ')}. You're keeping ${kept.map((m) => m.merchant).join(' and ')}; dropping ${others.map((m) => m.merchant).join(' and ')} would save about $${saving.toFixed(2)}/month.`
          : `${matches.map((m) => m.merchant).join(', ')}. Keeping only ${keeper.merchant} would save about $${saving.toFixed(2)}/month.`,
        monthlySaving: +saving.toFixed(2),
        subscriptionIds: matches.map((m) => m.id),
      });
    }
  }

  for (const s of active) {
    if (s.priceChange && s.priceChange.pct > 0) {
      tips.push({
        type: 'price_hike',
        title: `${s.merchant} raised its price`,
        detail: `Went from $${s.priceChange.from.toFixed(2)} to $${s.priceChange.to.toFixed(2)} (+${s.priceChange.pct.toFixed(0)}%). Worth checking for a cheaper tier.`,
        monthlySaving: +(s.priceChange.to - s.priceChange.from).toFixed(2),
        subscriptionIds: [s.id],
      });
    }
    if (s.trialConverted && s.userStatus !== 'keep') {
      tips.push({
        type: 'trial_converted',
        title: `${s.merchant} trial turned into a paid plan`,
        detail: `Started as a free trial and is now $${s.amount.toFixed(2)} ${s.cadence}. Cancel if you are not using it.`,
        monthlySaving: s.monthlyCost,
        subscriptionIds: [s.id],
      });
    }
  }

  const inactive = subscriptions.filter((s) => s.status === 'inactive');
  if (inactive.length) {
    tips.push({
      type: 'info',
      title: `${inactive.length} subscription${inactive.length > 1 ? 's look' : ' looks'} cancelled`,
      detail: inactive.map((s) => s.merchant).join(', '),
      monthlySaving: 0,
      subscriptionIds: inactive.map((s) => s.id),
    });
  }

  return tips.sort((a, b) => b.monthlySaving - a.monthlySaving);
}
