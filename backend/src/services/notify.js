/**
 * Sends reminders via SNS when SNS_TOPIC_ARN is set; logs to console in demo mode.
 *
 * Every message carries a `userId` message attribute. Each signed-in user's email is subscribed to the
 * topic with a filter policy on that attribute, so users only receive their own alerts.
 */
import { getMeta, putMeta } from './db.js';

const TOPIC = process.env.SNS_TOPIC_ARN;
let sns = null;

async function client() {
  if (!sns) {
    const { SNSClient } = await import('@aws-sdk/client-sns');
    sns = new SNSClient({});
  }
  return sns;
}

export async function sendAlert(subject, message, { userId } = {}) {
  if (!TOPIC) {
    console.log(`[notify:demo] ${userId ? `(${userId}) ` : ''}${subject}\n${message}\n`);
    return { delivered: false, channel: 'console' };
  }
  const { PublishCommand } = await import('@aws-sdk/client-sns');
  await (await client()).send(new PublishCommand({
    TopicArn: TOPIC, Subject: subject.slice(0, 99), Message: message,
    ...(userId ? { MessageAttributes: { userId: { DataType: 'String', StringValue: userId } } } : {}),
  }));
  return { delivered: true, channel: 'sns' };
}

const subscribed = new Set(); // per-container cache so we don't hit DynamoDB on every request

/**
 * Subscribes the user's email to their own alerts (filtered by userId). SNS emails a confirmation link
 * the first time. Safe to call on every request.
 */
export async function ensureAlertSubscription(userId, email) {
  if (!TOPIC || !email || subscribed.has(`${userId}:${email}`)) return;
  const current = await getMeta(userId, 'alerts');
  if (current?.email !== email) {
    const { SubscribeCommand, UnsubscribeCommand } = await import('@aws-sdk/client-sns');
    if (current?.subscriptionArn?.startsWith('arn:')) {
      await (await client()).send(new UnsubscribeCommand({ SubscriptionArn: current.subscriptionArn })).catch(() => {});
    }
    const res = await (await client()).send(new SubscribeCommand({
      TopicArn: TOPIC, Protocol: 'email', Endpoint: email, ReturnSubscriptionArn: true,
      Attributes: { FilterPolicy: JSON.stringify({ userId: [userId] }) },
    }));
    await putMeta(userId, 'alerts', { email, subscriptionArn: res.SubscriptionArn });
  }
  subscribed.add(`${userId}:${email}`);
}
