import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
} from 'n8n-workflow';
import { pingwaApiRequest } from '../shared/GenericFunctions';

export class Pingwa implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingwa',
    name: 'pingwa',
    icon: 'file:pingwa.svg',
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
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
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const out: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter('operation', i) as string;
        if (operation === 'notify') {
          const body: IDataObject = { text: this.getNodeParameter('text', i) as string };
          const imageUrl = this.getNodeParameter('imageUrl', i, '') as string;
          if (imageUrl) body.image_url = imageUrl;
          const idem = this.getNodeParameter('idempotencyKey', i, '') as string;
          const headers = idem ? { 'Idempotency-Key': idem } : undefined;
          const res = await pingwaApiRequest.call(this, 'POST', '/v1/notify', body, undefined, headers);
          out.push({ json: res, pairedItem: { item: i } });
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
