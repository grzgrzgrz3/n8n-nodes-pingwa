import type {
  IPollFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IDataObject,
} from 'n8n-workflow';
import { pingwaApiRequest, inboxToItems, filterReplies, InboxRow } from '../shared/GenericFunctions';

export class PingwaPollTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingwa Poll Trigger',
    name: 'pingwaPollTrigger',
    icon: 'file:pingwa.svg',
    group: ['trigger'],
    version: 1,
    polling: true,
    subtitle: '=Events: {{$parameter["events"]}}',
    description: 'Polls pingwa for inbound WhatsApp messages (use when n8n has no public URL)',
    eventTriggerDescription: 'Waiting for an inbound WhatsApp message via pingwa',
    activationMessage: 'You can now receive inbound WhatsApp messages from pingwa.',
    defaults: { name: 'Pingwa Poll Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [
      { name: 'pingwaApi', required: true, displayOptions: { show: { authentication: ['pingwaApi'] } } },
      { name: 'pingwaOAuth2Api', required: true, displayOptions: { show: { authentication: ['pingwaOAuth2Api'] } } },
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

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
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
