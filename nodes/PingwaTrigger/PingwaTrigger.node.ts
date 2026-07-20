import type {
  IHookFunctions,
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  IDataObject,
} from 'n8n-workflow';
import { pingwaApiRequest, filterReplies, verifyPingwaSignature, InboundItem } from '../shared/GenericFunctions';

export class PingwaTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingwa Trigger',
    name: 'pingwaTrigger',
    icon: 'file:pingwa.svg',
    group: ['trigger'],
    version: 1,
    subtitle: '=Events: {{$parameter["events"]}}',
    description: 'Starts the workflow when someone replies on WhatsApp via pingwa (webhook)',
    eventTriggerDescription: 'Waiting for an inbound WhatsApp message via pingwa',
    activationMessage: 'You can now receive inbound WhatsApp messages from pingwa.',
    defaults: { name: 'Pingwa Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [
      { name: 'pingwaApi', required: true, displayOptions: { show: { authentication: ['pingwaApi'] } } },
      { name: 'pingwaOAuth2Api', required: true, displayOptions: { show: { authentication: ['pingwaOAuth2Api'] } } },
    ],
    webhooks: [
      // rawBody:true makes n8n expose req.rawBody — REQUIRED: pingwa signs the exact
      // bytes it sent (Python json.dumps, spaces after ':' and ','), which JS
      // JSON.stringify can never reproduce. We must HMAC the raw bytes, never a re-serialize.
      { name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook', rawBody: true },
    ],
    properties: [
      {
        displayName: 'Authentication',
        name: 'authentication',
        type: 'options',
        options: [
          { name: 'API Key', value: 'pingwaApi' },
          { name: 'OAuth2 (Connect)', value: 'pingwaOAuth2Api' },
        ],
        default: 'pingwaApi',
      },
      {
        displayName: 'Events',
        name: 'events',
        type: 'options',
        options: [
          { name: 'All Inbound Messages', value: 'all' },
          { name: 'Replies Only', value: 'replies' },
        ],
        default: 'all',
        description: 'Replies Only fires only when the message answers one you sent',
      },
    ],
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const data = this.getWorkflowStaticData('node');
        const res = await pingwaApiRequest.call(this, 'GET', '/v1/webhooks');
        const list = (res.webhooks as IDataObject[]) ?? [];
        const found = list.find((w) => w.url === webhookUrl);
        if (found) {
          data.webhookId = found.id;
          return true;
        }
        return false;
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const res = await pingwaApiRequest.call(this, 'POST', '/v1/webhooks', { url: webhookUrl });
        const data = this.getWorkflowStaticData('node');
        data.webhookId = res.id;
        data.webhookSecret = res.secret; // shown once; needed to verify signatures
        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData('node');
        if (data.webhookId) {
          await pingwaApiRequest.call(this, 'DELETE', `/v1/webhooks/${data.webhookId}`);
        }
        delete data.webhookId;
        delete data.webhookSecret;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const data = this.getWorkflowStaticData('node');
    const secret = data.webhookSecret as string | undefined;
    const req = this.getRequestObject();
    const headers = this.getHeaderData() as IDataObject;
    const signature = headers['x-pingwa-signature'] as string | undefined;

    // Verify the EXACT bytes pingwa signed. With rawBody:true set on the webhook
    // descriptor, n8n populates req.rawBody. If it is somehow absent, reject rather
    // than re-serialize (JS JSON.stringify never matches Python json.dumps spacing).
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!secret || !rawBody || !verifyPingwaSignature(rawBody, signature, secret)) {
      return { noWebhookResponse: true }; // reject silently; do not emit
    }

    const payload = this.getBodyData() as unknown as InboundItem;
    const events = this.getNodeParameter('events') as string;
    const items = events === 'replies' ? filterReplies([payload]) : [payload];
    if (!items.length) return { noWebhookResponse: true };

    return { workflowData: [this.helpers.returnJsonArray(items as unknown as IDataObject[])] };
  }
}
