# EchoGuard Alexa skill

1. Deploy the stack; note the `AlexaFunctionArn` output.
2. In the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) create a Custom skill, "Provision your own" backend.
3. Build tab -> Interaction Model -> JSON Editor: paste `interaction-model.json`, save and build.
4. Endpoint -> AWS Lambda ARN -> paste the function ARN (the stack already grants `alexa-appkit.amazon.com` invoke permission).
5. Copy the skill ID (`amzn1.ask.skill.…`) from the console and re-deploy with `ALEXA_SKILL_ID=<skill id> ./infra/deploy.sh`. This locks the Lambda so no other skill can invoke it.
6. Test tab: "open money guard", "what renews this week", "ask money guard how can I save money". (Alexa does not allow "Echo" in invocation names, so the skill is called Money Guard.)

Local test without a device:

```bash
curl -s -XPOST localhost:4000/alexa -H 'content-type: application/json' \
  -d '{"request":{"type":"IntentRequest","intent":{"name":"RenewalsIntent"}}}'
```

To link a real user, set `ALEXA_USER_MAP="amzn1.ask.account.XXXX=<echoguard userId>"` on the Alexa Lambda.
