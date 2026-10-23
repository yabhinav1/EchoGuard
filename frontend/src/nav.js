export const NAV = [
  { group: 'Dashboard', items: [{ id: 'dashboard', label: 'Overview', icon: 'home' }] },
  {
    group: 'Money', caption: 'Subscriptions and spending', items: [
      { id: 'subscriptions', label: 'Subscriptions', icon: 'repeat' },
      { id: 'activity', label: 'Unusual activity', icon: 'alert', badge: 'alerts' },
      { id: 'budgets', label: 'Budgets', icon: 'wallet' },
    ],
  },
  {
    group: 'Tools', items: [
      { id: 'import', label: 'Add transactions', icon: 'receipt' },
      { id: 'assistant', label: 'Ask EchoGuard', icon: 'sparkles' },
    ],
  },
];
