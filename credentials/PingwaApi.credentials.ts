import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class PingwaApi implements ICredentialType {
  name = 'pingwaApi';
  displayName = 'Pingwa API';
  // eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased -- rule's autofix mangles valid URLs into camelCase
  documentationUrl = 'https://pingwa.dev/docs';
  properties: INodeProperties[] = [
    {
      displayName: 'How to get a key',
      name: 'notice',
      type: 'notice',
      default: '',
      description:
        'Open WhatsApp, send the word "join" to the pingwa number, and pingwa replies with your API key (starts with pw_). Paste it below.',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Your pingwa API key (pw_...)',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://pingwa.dev',
      description: 'Override only for self-hosted or staging pingwa',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
  };

  test: ICredentialTestRequest = {
    request: { baseURL: '={{$credentials.baseUrl}}', url: '/v1/me' },
  };
}
