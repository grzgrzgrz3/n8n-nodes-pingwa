import type {
  IHookFunctions,
  IWebhookFunctions,
  IPollFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IWebhookResponseData,
  IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
  pingwaApiRequest,
  inboxToItems,
  filterReplies,
  verifyPingwaSignature,
  InboundItem,
  InboxRow,
} from '../shared/GenericFunctions';

/**
 * One trigger, two delivery modes.
 *
 * n8n registers a webhook for every node that declares `webhooks`, and polls every
 * node that implements `poll()`. This node declares both, so the mode parameter is
 * what decides which one does any work: the unselected path returns early. Webhook
 * mode never subscribes on the pingwa side when polling is picked, and polling
 * returns nothing when the webhook is picked, so a message is only ever emitted once.
 */
export class PingwaTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingwa Trigger',
    name: 'pingwaTrigger',
    icon: { light: 'file:pingwa.svg', dark: 'file:pingwa.dark.svg' },
    group: ['trigger'],
    version: 1,
    polling: true,
    subtitle:
      '={{ ({ webhook: "Webhook", poll: "Polling" })[$parameter["delivery"]] + ": " + ({ all: "All Inbound Messages", replies: "Replies Only" })[$parameter["events"]] }}',
    description: 'Starts the workflow when a WhatsApp message arrives via pingwa',
    eventTriggerDescription: 'Waiting for an inbound WhatsApp message via pingwa',
    activationMessage: 'You can now receive inbound WhatsApp messages from pingwa.',
    defaults: { name: 'Pingwa Trigger' },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      { name: 'pingwaApi', required: true, displayOptions: { show: { authentication: ['pingwaApi'] } } },
      { name: 'pingwaOAuth2Api', required: true, displayOptions: { show: { authentication: ['pingwaOAuth2Api'] } } },
    ],
    webhooks: [
      // rawBody:true makes n8n expose req.rawBody — REQUIRED: pingwa signs the exact
      // bytes it sent (Python json.dumps, spaces after ':' and ','), which JS
      // JSON.stringify can never reproduce. We must HMAC the raw bytes, never a re-serialize.
      // The URL is hidden in polling mode, where nothing ever posts to it.
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
        rawBody: true,
        ndvHideUrl: '={{ $parameter["delivery"] === "poll" }}',
        ndvHideMethod: true,
      },
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
        // Not called "Mode": n8n prepends its own Poll Times collection, which already
        // has a "Mode" field inside it. Two fields labelled Mode in one panel is a trap.
        displayName: 'Delivery',
        name: 'delivery',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Webhook',
            value: 'webhook',
            description: 'Pingwa pushes each message the moment it arrives. Needs a public HTTPS URL for n8n.',
          },
          {
            name: 'Polling',
            value: 'poll',
            description: 'N8n pulls new messages on the schedule set in Poll Times. Works on a LAN-only n8n.',
          },
        ],
        default: 'webhook',
        description: 'How inbound messages reach n8n. Poll Times below only applies in polling mode.',
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
        // Polling mode: report the subscription as present so n8n never calls create().
        // Nothing is registered on the pingwa side, so nothing has to be torn down.
        if ((this.getNodeParameter('delivery', 'webhook') as string) === 'poll') return true;

        const webhookUrl = this.getNodeWebhookUrl('default');
        const data = this.getWorkflowStaticData('node');
        const res = await pingwaApiRequest.call(this, 'GET', '/v1/webhooks');
        const list = (res.webhooks as IDataObject[]) ?? [];
        const found = list.find((w) => w.url === webhookUrl);
        if (found && data.webhookSecret) {
          data.webhookId = found.id;
          return true;
        }
        // Subscription exists on the server but we lost the (one-time) secret — delete
        // the stale row so create() runs again and returns a fresh secret.
        if (found) {
          await pingwaApiRequest.call(this, 'DELETE', `/v1/webhooks/${encodeURIComponent(String(found.id))}`);
        }
        return false;
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const res = await pingwaApiRequest.call(this, 'POST', '/v1/webhooks', { url: webhookUrl });
        if (!res.secret) {
          // Without the signing secret every delivery would fail verification and be
          // dropped silently — fail loudly at activation instead.
          throw new NodeOperationError(this.getNode(), 'Pingwa did not return a webhook signing secret');
        }
        const data = this.getWorkflowStaticData('node');
        data.webhookId = res.id;
        data.webhookSecret = res.secret; // shown once; needed to verify signatures
        return true;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData('node');
        let deleted = true;
        if (data.webhookId) {
          try {
            await pingwaApiRequest.call(this, 'DELETE', `/v1/webhooks/${encodeURIComponent(String(data.webhookId))}`);
          } catch (error) {
            // Row already gone (404) or transient error. Local cleanup below must still
            // run so re-activation issues a fresh subscription, but the failure is
            // logged: a subscription left behind on the server keeps sending deliveries.
            deleted = false;
            this.logger.warn('Pingwa: could not delete the webhook subscription, clearing local state anyway', {
              webhookId: String(data.webhookId),
              error: (error as Error).message,
            });
          }
        }
        delete data.webhookId;
        delete data.webhookSecret;
        return deleted;
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
    // We take over the HTTP response on the reject/skip paths (noWebhookResponse),
    // so we MUST write it ourselves — otherwise the connection hangs until pingwa's
    // delivery times out and retries pile up.
    const resp = this.getResponseObject();
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!secret || !rawBody || !verifyPingwaSignature(rawBody, signature, secret)) {
      resp.status(401).end(); // bad/absent signature: reject, do not emit
      return { noWebhookResponse: true };
    }

    const payload = this.getBodyData() as unknown as InboundItem;
    const events = this.getNodeParameter('events') as string;
    const items = events === 'replies' ? filterReplies([payload]) : [payload];
    if (!items.length) {
      resp.status(200).end(); // authentic but filtered out (e.g. not a reply): ack, don't retry
      return { noWebhookResponse: true };
    }

    return { workflowData: [this.helpers.returnJsonArray(items as unknown as IDataObject[])] };
  }

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    // Webhook mode: pingwa pushes, so the scheduled poll must emit nothing.
    if ((this.getNodeParameter('delivery', 'webhook') as string) !== 'poll') return null;

    const data = this.getWorkflowStaticData('node');
    const isManual = this.getMode() === 'manual';

    // First production poll: baseline at activation time and emit nothing. Without a
    // `since`, /v1/inbox returns the oldest messages — emitting them would flood a live
    // workflow with the whole inbox history. Manual test runs skip this and fetch latest.
    if (!isManual && !data.cursor) {
      data.cursor = new Date().toISOString();
      return null;
    }

    const qs: IDataObject = { limit: 100 };
    if (!isManual && data.cursor) qs.since = data.cursor as string;

    const res = await pingwaApiRequest.call(this, 'GET', '/v1/inbox', undefined, qs);
    const rows = (res.messages as InboxRow[]) ?? [];
    if (!rows.length) return null;

    if (!isManual && res.cursor) data.cursor = res.cursor as string;

    const events = this.getNodeParameter('events', 'all') as string;
    let items = inboxToItems(rows);
    if (events === 'replies') items = filterReplies(items);
    if (!items.length) return null;

    return [this.helpers.returnJsonArray(items as unknown as IDataObject[])];
  }
}
