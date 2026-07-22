import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { pingwaApiRequest } from '../shared/GenericFunctions';

export class Pingwa implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingwa',
    name: 'pingwa',
    icon: { light: 'file:pingwa.svg', dark: 'file:pingwa.dark.svg' },
    group: ['output'],
    version: 1,
    usableAsTool: true,
    subtitle: '={{ ({ notify: "Notify", ask: "Ask", getReply: "Get Reply" })[$parameter["operation"]] }}',
    description: 'Send WhatsApp notifications and human-in-the-loop questions via pingwa',
    defaults: { name: 'Pingwa' },
    inputs: ['main'],
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
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Notify',
            value: 'notify',
            action: 'Send a notification',
            description: 'Fire-and-forget WhatsApp message',
          },
          {
            name: 'Ask',
            value: 'ask',
            action: 'Ask a question and wait for a reply',
            description: 'Send a question and block until the human answers (or timeout)',
          },
          {
            name: 'Get Reply',
            value: 'getReply',
            action: 'Get the reply to a message',
            description: 'Fetch the human reply to a previously sent message',
          },
        ],
        default: 'notify',
      },
      {
        displayName: 'Message',
        name: 'text',
        type: 'string',
        typeOptions: { rows: 3 },
        default: '',
        required: true,
        placeholder: 'e.g. Backup finished: 42 GB in 6 minutes',
        description: 'The WhatsApp message to send to your own linked number',
        displayOptions: { show: { operation: ['notify'] } },
      },
      {
        displayName: 'Image URL',
        name: 'imageUrl',
        type: 'string',
        default: '',
        description: 'Optional public https image to attach',
        displayOptions: { show: { operation: ['notify'] } },
      },
      {
        displayName: 'Idempotency Key',
        name: 'idempotencyKey',
        type: 'string',
        default: '',
        description: 'Optional — resending with the same key does not send twice',
        displayOptions: { show: { operation: ['notify'] } },
      },
      {
        displayName: 'Question',
        name: 'askText',
        type: 'string',
        typeOptions: { rows: 3 },
        default: '',
        required: true,
        placeholder: 'e.g. Approve the $4,200 refund?',
        description: 'The question to send. The workflow pauses on this node until you answer or it times out.',
        displayOptions: { show: { operation: ['ask'] } },
      },
      {
        displayName: 'Buttons',
        name: 'buttons',
        type: 'string',
        typeOptions: { multipleValues: true },
        default: [],
        placeholder: 'Add button',
        description: 'Optional reply buttons (titles). Cold sends fold them into the text as a numbered list.',
        displayOptions: { show: { operation: ['ask'] } },
      },
      {
        displayName: 'Timeout (Seconds)',
        name: 'timeout',
        type: 'number',
        default: 0,
        typeOptions: { minValue: 0 },
        description: 'How long to wait for the human. 0 = server default. Server clamps to its max.',
        displayOptions: { show: { operation: ['ask'] } },
      },
      {
        displayName: 'On Timeout',
        name: 'onTimeout',
        type: 'options',
        options: [
          { name: 'Continue With Empty Reply', value: 'continue' },
          { name: 'Fail the Node', value: 'error' },
        ],
        default: 'continue',
        displayOptions: { show: { operation: ['ask'] } },
      },
      {
        displayName: 'Message ID',
        name: 'messageId',
        type: 'string',
        default: '',
        required: true,
        description: 'The ID returned by a prior Ask or Notify',
        displayOptions: { show: { operation: ['getReply'] } },
      },
      {
        displayName: 'Wait (Seconds)',
        name: 'replyWait',
        type: 'number',
        default: 0,
        description: 'Long-poll up to this many seconds for a reply. 0 = return immediately.',
        displayOptions: { show: { operation: ['getReply'] } },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const out: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter('operation', i) as string;
        if (!['notify', 'ask', 'getReply'].includes(operation)) {
          throw new NodeOperationError(
            this.getNode(),
            `The operation "${operation}" is not supported`,
            { itemIndex: i },
          );
        }
        if (operation === 'notify') {
          const body: IDataObject = { text: this.getNodeParameter('text', i) as string };
          const imageUrl = this.getNodeParameter('imageUrl', i, '') as string;
          if (imageUrl) body.image_url = imageUrl;
          const idem = this.getNodeParameter('idempotencyKey', i, '') as string;
          const headers = idem ? { 'Idempotency-Key': idem } : undefined;
          const res = await pingwaApiRequest.call(this, 'POST', '/v1/notify', body, undefined, headers);
          out.push({ json: res, pairedItem: { item: i } });
        }
        if (operation === 'ask') {
          const body: IDataObject = { text: this.getNodeParameter('askText', i) as string };
          const buttons = this.getNodeParameter('buttons', i, []) as string[];
          if (buttons.length) body.buttons = buttons;
          const timeout = this.getNodeParameter('timeout', i, 0) as number;
          if (timeout > 0) body.timeout = timeout;
          const onTimeout = this.getNodeParameter('onTimeout', i, 'continue') as string;

          const res = await pingwaApiRequest.call(
            this, 'POST', '/v1/ask', body, undefined, undefined, [408],
            timeout > 0 ? (timeout + 15) * 1000 : undefined,
          );
          if ((res.__status as number) === 408) {
            if (onTimeout === 'error') {
              throw new NodeOperationError(this.getNode(), 'No reply before timeout', { itemIndex: i });
            }
            out.push({
              json: { answered: false, timedOut: true, message_id: res.message_id ?? null },
              pairedItem: { item: i },
            });
          } else {
            out.push({ json: res, pairedItem: { item: i } });
          }
        }
        if (operation === 'getReply') {
          const messageId = this.getNodeParameter('messageId', i) as string;
          const wait = this.getNodeParameter('replyWait', i, 0) as number;
          const qs: IDataObject = wait > 0 ? { wait } : {};
          const res = await pingwaApiRequest.call(
            this, 'GET', `/v1/messages/${encodeURIComponent(messageId)}/reply`, undefined, qs, undefined, [408],
            wait > 0 ? (wait + 15) * 1000 : undefined,
          );
          if ((res.__status as number) === 408) {
            out.push({ json: { answered: false, message_id: messageId }, pairedItem: { item: i } });
          } else {
            out.push({ json: res, pairedItem: { item: i } });
          }
        }
      } catch (error) {
        if (this.continueOnFail()) {
          out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
          continue;
        }
        throw error;
      }
    }
    return [out];
  }
}
