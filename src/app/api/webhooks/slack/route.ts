import { slackWebhook } from '@/server/messaging-providers';
import { webhookResponse } from '@/server/messaging-webhook-response';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function POST(request:Request){return webhookResponse(()=>slackWebhook(request));}
