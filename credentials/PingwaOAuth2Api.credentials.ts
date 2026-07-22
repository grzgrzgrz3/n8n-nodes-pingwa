import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class PingwaOAuth2Api implements ICredentialType {
  name = 'pingwaOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Pingwa OAuth2 API';
  // eslint-disable-next-line n8n-nodes-base/cred-class-field-documentation-url-miscased -- rule's autofix mangles valid URLs into camelCase
  documentationUrl = 'https://pingwa.dev/docs';
  properties: INodeProperties[] = [
    {
      displayName: 'Just click Connect',
      name: 'notice',
      type: 'notice',
      default: '',
      description:
        'No client ID or secret to enter — the defaults target pingwa.dev. Click "Connect", sign in, and pick the WhatsApp number to use.',
    },
    { displayName: 'Grant Type', name: 'grantType', type: 'hidden', default: 'pkce' },
    { displayName: 'Client ID', name: 'clientId', type: 'hidden', default: 'n8n' },
    {
      displayName: 'Client Secret',
      name: 'clientSecret',
      type: 'hidden',
      default: '',
      typeOptions: { password: true },
    },
    { displayName: 'Scope', name: 'scope', type: 'hidden', default: 'send inbox' },
    { displayName: 'Authentication', name: 'authentication', type: 'hidden', default: 'header' },
    // Visible so self-host / staging can retarget. Defaults = prod; most users never touch them.
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://pingwa.dev',
      description: 'Pingwa API base for /v1 calls. Change only for self-host or staging.',
    },
    {
      displayName: 'Authorization URL',
      name: 'authUrl',
      type: 'string',
      default: 'https://pingwa.dev/oauth/authorize',
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      // eslint-disable-next-line n8n-nodes-base/node-param-type-options-password-missing
      type: 'string',
      default: 'https://pingwa.dev/oauth/token',
    },
  ];
}
