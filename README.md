# EchoGuard 🔐

AI subscription and spending tracker. Detects recurring payments, flags unusual charges, finds savings, and sends reminders before renewals.

Built for the Amazon hackathon on AWS Lambda, DynamoDB, Amazon Bedrock, SNS, and EventBridge.

## What it does

| Feature | How |
|---|---|
| Subscription auto-discovery | Groups transactions by normalized merchant, matches weekly / monthly / yearly cadences |
| Price hike alerts | Flags when a recurring charge changes amount (Netflix 15.49 → 17.99) |
| Free trial conversions | Detects a $0 first charge followed by a paid one |
| Cancelled subscription detection | Recurring charge that stopped renewing |
| Duplicate charge detection | Same merchant and amount within 10 minutes |
| Spending anomalies | Z-score outliers per category, large first-time merchants, weekly category spikes |
| Savings suggestions | Overlapping services (Spotify + YouTube Music), price hikes, converted trials |
| Natural language Q&A | "What can I cancel?" answered by Claude on Bedrock over the user's data |
| Weekly digest | LLM-written summary email |
| Renewal reminders | Daily EventBridge job publishes to SNS (email / SMS) 3 days before renewals |
| Budget guardrails | Per-category monthly budgets with 80% warning, over-budget and pace-to-exceed alerts |
| Receipt scanning | Photo → Amazon Textract AnalyzeExpense → merchant, total, date, line items → category via Bedrock |
| Bank sync | Plaid Link (sandbox or live) with incremental transactions sync, plus CSV import for any bank export |
| Alexa skill | "Alexa, ask Echo Guard what renews this week" — same analysis, voice answers |
| Sign-in | Cognito Hosted UI with PKCE; the API's JWT authorizer scopes data per user |

## Run locally (demo mode, no AWS account needed)

```bash
npm install
npm run seed      # generates 6 months of synthetic transactions with planted anomalies
npm run dev       # API on :4000, web on :5173
```

Open http://localhost:5173. In demo mode the API uses an in-memory store and a rule-based responder instead of Bedrock, so everything works offline.

To use real Bedrock locally, configure AWS credentials and run:

```bash
USE_BEDROCK=true AWS_REGION=us-east-1 npm run dev
```

## Deploy to AWS

Prereqs: AWS CLI, SAM CLI, and Claude model access enabled in the Bedrock console for your region.

```bash
ALERT_EMAIL=you@example.com ./infra/deploy.sh
```

This creates the DynamoDB table, SNS topic, Cognito user pool + hosted UI, HTTP API + Lambda (JWT-protected), the scheduled reminder Lambda, the Alexa Lambda, a private S3 bucket behind a CloudFront (HTTPS) distribution, seeds the demo data, and uploads the built frontend. The first deploy takes a few extra minutes while CloudFront provisions. Confirm the SNS email subscription to receive alerts.

Optional environment variables for the deploy script:

| Variable | Effect |
|---|---|
| `ENABLE_AUTH=false` | Skip Cognito; the API is open and the frontend uses the shared demo user (handy for judging) |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | Turn on the "Link bank" button (sandbox login: user_good / pass_good) |
| `ALERT_EMAIL` | Subscribe an email to the demo user's reminders and alerts |
| `FRONTEND_ORIGIN` | Extra allowed Cognito redirect origin, e.g. a custom domain (the CloudFront URL is always allowed) |
| `ALEXA_SKILL_ID` | Only this Alexa skill may invoke the Alexa Lambda (set it once the skill exists, then re-run) |

Signed-in users are subscribed to their own alerts automatically: on their first API call SNS emails them a confirmation link, and from then on they get only their own reminders (an SNS filter policy on `userId`). Plaid access tokens are encrypted with a KMS key the stack creates before they are stored.

To wire up Alexa, follow [backend/alexa/README.md](backend/alexa/README.md): paste the interaction model and the `AlexaFunctionArn` output into a custom skill, then re-deploy with `ALEXA_SKILL_ID`.

## Project layout

```
backend/
  src/handlers/api.js          route handlers (framework-agnostic)
  src/handlers/lambda.js       API Gateway + EventBridge entry points
  src/local-server.js          Express wrapper for local dev
  src/services/
    subscriptionDetector.js    recurring-payment detection
    anomalyDetector.js         unusual-spend detection
    insights.js                savings suggestions
    analysis.js                combines everything for one user
    ai.js                      Bedrock (Claude) with rule-based fallback
    budgets.js                 per-category budgets and alerts
    receipts.js                Textract receipt scanning + text parser
    categorize.js              merchant → category (Bedrock or keywords)
    importers.js               CSV import
    plaid.js                   Plaid Link + transactions sync
    alexa.js                   Alexa Skills Kit intent handler
    db.js                      DynamoDB or in-memory store
    notify.js                  SNS or console
  alexa/interaction-model.json Alexa skill model
  scripts/generate-seed.js     synthetic data generator
  tests/                       node:test suite
frontend/                      React + Vite dashboard (recharts)
infra/template.yaml            SAM template
infra/deploy.sh                one-shot deploy
```

## API

All routes take an `X-User-Id` header (defaults to `demo`). With Cognito in front of the HTTP API the JWT `sub` claim is used instead.

```
GET  /health
GET  /dashboard            everything: summary, subscriptions, anomalies, tips, charts
GET  /subscriptions
GET  /anomalies
GET  /insights
GET  /transactions?limit=50&category=Dining
POST /transactions         single object or array: { merchant, amount, date, category? }
DELETE /transactions/:id
POST /chat                 { question }
GET  /digest
POST /reminders/run        trigger the reminder job now
GET  /budgets              budgets + month-to-date status
PUT  /budgets              { Dining: 600, Groceries: 700, ... }
POST /receipts             { imageBase64 } or { text }, optional save: true
POST /transactions/import  { csv }
POST /plaid/link-token     start Plaid Link
POST /plaid/exchange       { publicToken } then syncs
POST /plaid/sync           pull new transactions
POST /alexa                Alexa request JSON (local testing; deployed as its own Lambda)
```

When deployed with auth enabled, send `Authorization: Bearer <Cognito id token>` instead of `X-User-Id`.

## Tests

```bash
npm test
```

## Demo-mode limits

Without AWS credentials the app runs fully offline: in-memory data, rule-based answers, text-only receipt parsing, no bank linking, and a shared demo user. Every feature switches to the real service (Bedrock, Textract, Plaid, Cognito, SNS) once deployed or when the matching env vars are set.

## Ideas for next steps

- Cancel-assist: generate cancellation emails or deep links per service
- Shared / family mode with split subscriptions
