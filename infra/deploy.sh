#!/usr/bin/env bash
# One-shot deploy: backend via SAM, then build + upload the frontend.
# Prereqs: aws cli, sam cli, credentials configured (Bedrock model access only if ENABLE_BEDROCK=true).
set -euo pipefail
cd "$(dirname "$0")"
STACK=${STACK:-echoguard}
REGION=${AWS_REGION:-us-east-1}

# Optional local settings (git-ignored), e.g. ALERT_EMAIL, ALEXA_SKILL_ID, PLAID_* keys.
# Variables already set in the environment win over the file.
if [ -f .env.deploy ]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    [ -z "${!key:-}" ] && export "$key=$value"
  done < .env.deploy
fi

# SAM rejects empty "Key=" overrides, so optional settings are only passed when set (blank ones use the template default)
PARAMS=(
  EnableAuth="${ENABLE_AUTH:-true}" PlaidEnv="${PLAID_ENV:-sandbox}"
  EnableBedrock="${ENABLE_BEDROCK:-false}" EnableTextract="${ENABLE_TEXTRACT:-false}"
  FrontendOrigin="${FRONTEND_ORIGIN:-http://localhost:5173}"
)
[ -n "${ALERT_EMAIL:-}" ] && PARAMS+=(AlertEmail="$ALERT_EMAIL")
[ -n "${PLAID_CLIENT_ID:-}" ] && PARAMS+=(PlaidClientId="$PLAID_CLIENT_ID" PlaidSecret="${PLAID_SECRET:-}")
[ -n "${ALEXA_SKILL_ID:-}" ] && PARAMS+=(AlexaSkillId="$ALEXA_SKILL_ID")

sam build -t template.yaml
sam deploy -t template.yaml --stack-name "$STACK" --region "$REGION" --resolve-s3 \
  --capabilities CAPABILITY_IAM --no-confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAMS[@]}"

API=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" --output text)
SITE=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text)

echo "Seeding demo data into DynamoDB..."
(cd ../backend && TABLE_NAME=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text) \
  AWS_REGION=$REGION node scripts/seed-dynamo.js)

out() { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
COGNITO_DOMAIN=$(out CognitoDomain); COGNITO_CLIENT=$(out CognitoClientId); ALEXA_ARN=$(out AlexaFunctionArn)

echo "Building frontend against $API"
if [ "${ENABLE_AUTH:-true}" = "true" ]; then
  (cd ../frontend && VITE_API_URL=$API VITE_COGNITO_DOMAIN=$COGNITO_DOMAIN VITE_COGNITO_CLIENT_ID=$COGNITO_CLIENT VITE_COGNITO_REDIRECT="${FRONTEND_ORIGIN:-$SITE}/" npm run build)
else
  (cd ../frontend && VITE_API_URL=$API npm run build)
fi
aws s3 sync ../frontend/dist "s3://$BUCKET" --delete --region "$REGION"
aws cloudfront create-invalidation --distribution-id "$(out FrontendDistributionId)" --paths '/*' --query 'Invalidation.Id' --output text

echo
echo "API:          $API"
echo "Frontend:     $SITE"
echo "Cognito:      $COGNITO_DOMAIN (client $COGNITO_CLIENT)"
echo "Alexa Lambda: $ALEXA_ARN  (paste into the Alexa skill endpoint, see backend/alexa/README.md)"
if [ -z "${ALEXA_SKILL_ID:-}" ]; then
  echo "              Any Alexa skill can invoke it until you re-run with ALEXA_SKILL_ID=amzn1.ask.skill.xxx"
fi
