# EchoGuard architecture

```
                 ┌──────────────┐        ┌───────────────────┐
  Browser ──────▶│ CloudFront   │        │ Cognito Hosted UI │◀── sign-in (PKCE)
  (React/Vite)   │  → S3 (OAC)  │        │                   │
                 └──────────────┘        └───────────────────┘
       │ Bearer id token                          │ JWT
       ▼                                          ▼
  ┌────────────────────┐   JWT authorizer   ┌──────────────┐
  │ API Gateway (HTTP) │───────────────────▶│ ApiFunction  │──┐
  └────────────────────┘                    │   (Lambda)   │  │
                                            └──────┬───────┘  │
  Alexa ─────▶ AlexaFunction (Lambda) ─────────────┤          │
                                                   ▼          ▼
  EventBridge (daily) ─▶ ReminderFunction ─▶ DynamoDB     Bedrock (optional)
                              │                             Textract (optional)
                              ▼                             Plaid (optional)
                         SNS topic ─▶ email / SMS
```

## Request flow

1. The frontend signs in through Cognito's Hosted UI and keeps the id token in local storage.
2. Every API call carries `Authorization: Bearer <id token>`. API Gateway validates it; the Lambda reads the `sub` claim as the user id. With auth disabled, an `X-User-Id` header is used instead (demo mode).
3. `analysis.js` loads the user's transactions from DynamoDB and runs the detectors in memory. Everything on the dashboard comes from that single pass.
4. Questions (typed, spoken, or via Alexa) and the weekly digest are answered from that analysis by the built-in assistant. With `USE_BEDROCK=true`, Claude on Bedrock answers instead, with the built-in assistant as fallback.
5. The reminder Lambda runs daily for every user with an alert subscription (plus the demo user), re-runs the analysis, and publishes renewals, high-severity anomalies, and budget alerts to SNS with a `userId` message attribute. Each user's email subscription has a filter policy on that attribute, created on their first authenticated API call.

## Data model (single DynamoDB table)

| PK | SK | Item |
|---|---|---|
| `USER#<id>` | `TX#<isoDate>#<txId>` | transaction |
| `USER#<id>` | `META#budgets` | `{ value: { Dining: 600, ... } }` |
| `USER#<id>` | `META#plaidItems` | linked bank items with sync cursors; access tokens KMS-encrypted |
| `USER#<id>` | `META#prefs` | `{ subscriptions: { id: { status: keep/cancelled } }, dismissed: [anomalyIds] }` |
| `USER#<id>` | `META#alerts` | `{ email, subscriptionArn }` for the user's filtered SNS subscription |

## Detection logic

- **Subscriptions**: group by normalized merchant, compute gaps between charges, match to weekly / monthly / yearly with tolerance. Price change if the last charge differs from the previous by more than 2%. Trial if the first charge was $0. Inactive if the expected renewal is well overdue.
- **Anomalies**: duplicate charges within 10 minutes; per-category z-score outliers; large first-time merchants; weekly category spikes. Each anomaly carries a plain-English reason so the UI and Alexa can read it out.
- **Savings**: overlapping services from a small taxonomy, price hikes, converted trials, cancelled subscriptions.
- **Budgets**: month-to-date spend vs. limit with 80% / 100% thresholds and a pace projection.
- **Forecast**: each active subscription's next charges in the coming 30 days, plus everyday spending at the 90-day average rate (the largest 2% of purchases excluded).
- **Feedback**: subscriptions marked *cancelled* drop out of totals, renewals and tips; ones marked *keep* are never suggested for cancelling; dismissed anomalies stay hidden.

## Demo data

`demoData.js` generates the same synthetic history every time, anchored to a fixed date so tests are deterministic. Seeded transactions are shifted forward by the days elapsed since that anchor whenever they are read, so a deployed demo never goes stale. Transactions users add are never shifted.

## Alexa

The skill's interaction model lives in `backend/alexa/`. The Alexa Lambda and the in-browser simulator (`POST /alexa/simulate`) call the same handler; the simulator maps an utterance to an intent using the model's own sample utterances, falling back to the free-form `AskIntent`.

## Local vs. deployed

| Capability | Local demo | Deployed |
|---|---|---|
| Storage | in-memory demo data | DynamoDB |
| Answers | built-in assistant | built-in assistant, or Bedrock (Claude) when enabled |
| Receipts | text parser | text parser, or Textract when enabled |
| Bank sync | CSV import | Plaid + CSV |
| Auth | shared demo user | Cognito |
| Alerts | console log | SNS |
