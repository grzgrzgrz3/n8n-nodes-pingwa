# n8n-nodes-pingwa — Node Package Implementation Plan (Repo A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `n8n-nodes-pingwa`, an n8n community node package (Action: notify/ask/get-reply; webhook Trigger; poll Trigger) plus two credential types (manual API key + OAuth2 one-click), publishable to npm and installable from n8n's Community Nodes UI.

**Architecture:** A standard TypeScript n8n node package. All HTTP goes through one shared request helper that reads `baseUrl` + bearer from whichever pingwa credential is set. Two triggers cover both deployment shapes: a webhook trigger that auto-registers/deletes its subscription with pingwa and verifies the `X-Pingwa-Signature` HMAC, and a poll trigger that walks `/v1/inbox` with a stored cursor for LAN-only n8n. Pure logic (signature verify, inbox→item mapping, error mapping) lives in `GenericFunctions.ts` and is unit-tested with jest.

**Tech Stack:** TypeScript, n8n-workflow types (`n8n-workflow` peer dep), jest + ts-jest, `eslint-plugin-n8n-nodes-base`, gulp (icon copy), Node ≥18.

**Repo:** `~/git/pingwa/n8n-nodes` (git default branch `master`; work on `main`-style feature branches per task group, but this is a fresh solo repo so committing to the default branch per task is fine).

**Commits:** every commit ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. This is a clean-room PUBLIC repo — NO `Claude-Session:` trailer; no 360dialog strings; git identity `grzgrzgrz3@gmail.com`. The `-m` commands in each task show the subject only — append the trailer.

**Backend contract (already built in Repo B `~/git/pingwa/server`, consumed as-is):** see the design spec `~/git/pingwa/n8n-nodes/docs/2026-07-19-n8n-nodes-pingwa-design.md`. Key facts used below:
- Auth: header `Authorization: Bearer pw_...`. Base URL default `https://pingwa.dev`.
- `POST /v1/notify` body `{text, image_url?}` header `Idempotency-Key?` → `{id,billing_class,status}`.
- `POST /v1/ask` body `{text, buttons?, timeout?}` → `{message_id,billing_class,answered,reply}`; **408** `{error:"ask_timeout",message_id}` on timeout.
- `GET /v1/messages/{id}/reply?wait=` → `{message_id,answered,reply}`; **408** `{error:"no_reply_yet"}`.
- `GET /v1/inbox?since=&wait=&limit=` → `{messages:[{id,body,button_id,reply_to_message_id,wa_message_id,created_at}],cursor}`.
- `POST /v1/webhooks` body `{url}` → `{id,url,secret,active,created_at}` (secret once); `GET /v1/webhooks`; `DELETE /v1/webhooks/{id}`.
- Inbound webhook: header `X-Pingwa-Signature: sha256=<hex>`, `hex = HMAC_SHA256(secret, raw_body)`. Body `{event,message_id,body,button_id,reply_to_message_id,wa_message_id,window_open,created_at,media?}`.
- OAuth2 (Repo B, gated): `GET /oauth/authorize`, `POST /oauth/token`, public PKCE client `client_id=n8n`.

**Testing target:** unit tests run offline against pure functions. A manual staging smoke test (Task 14) uses `https://pingwa.grzgrzgrz3.ovh` (LAN-only) — not part of CI.

---

### Task 1: Repo scaffold + toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `.eslintrc.js`, `.prettierrc.js`, `gulpfile.js`, `jest.config.js`, `index.ts`, `LICENSE`, `.gitignore` (exists), `.npmignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "n8n-nodes-pingwa",
  "version": "0.1.0",
  "description": "n8n community node for pingwa — WhatsApp notifications and human-in-the-loop for AI agents.",
  "keywords": ["n8n-community-node-package", "n8n", "pingwa", "whatsapp", "human-in-the-loop"],
  "license": "MIT",
  "homepage": "https://pingwa.dev",
  "author": { "name": "Grzegorz Grzywacz", "email": "grzgrzgrz3@gmail.com" },
  "repository": { "type": "git", "url": "git+https://github.com/grzgrzgrz3/n8n-nodes-pingwa.git" },
  "engines": { "node": ">=18.10" },
  "main": "index.js",
  "scripts": {
    "build": "tsc -p tsconfig.build.json && gulp build:icons",
    "dev": "tsc -p tsconfig.build.json --watch",
    "lint": "eslint nodes credentials package.json",
    "lintfix": "eslint nodes credentials package.json --fix",
    "test": "jest",
    "prepublishOnly": "npm run build && npm run lint && npm test"
  },
  "files": ["dist"],
  "n8n": {
    "n8nNodesApiVersion": 1,
    "credentials": [
      "dist/credentials/PingwaApi.credentials.js",
      "dist/credentials/PingwaOAuth2Api.credentials.js"
    ],
    "nodes": [
      "dist/nodes/Pingwa/Pingwa.node.js",
      "dist/nodes/PingwaTrigger/PingwaTrigger.node.js",
      "dist/nodes/PingwaPollTrigger/PingwaPollTrigger.node.js"
    ]
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@typescript-eslint/parser": "^7.13.0",
    "eslint": "^8.57.0",
    "eslint-plugin-n8n-nodes-base": "^1.16.1",
    "gulp": "^5.0.0",
    "jest": "^29.7.0",
    "n8n-workflow": "^1.60.0",
    "prettier": "^3.3.0",
    "ts-jest": "^29.1.5",
    "typescript": "^5.4.5"
  },
  "peerDependencies": { "n8n-workflow": "*" }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "commonjs",
    "moduleResolution": "node",
    "target": "es2019",
    "lib": ["es2019", "es2020", "es2022.error"],
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "outDir": "./dist/",
    "useUnknownInCatchVariables": false
  },
  "include": ["credentials/**/*", "nodes/**/*", "index.ts"],
  "exclude": ["**/*.test.ts", "node_modules", "dist"]
}
```

- [ ] **Step 3: Write `tsconfig.build.json`** (build excludes tests)

```json
{ "extends": "./tsconfig.json", "exclude": ["**/*.test.ts", "node_modules", "dist"] }
```

- [ ] **Step 4: Write `.eslintrc.js`** (n8n ruleset)

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', extraFileExtensions: ['.json'] },
  ignorePatterns: ['dist/**', 'node_modules/**', '**/*.test.ts', 'jest.config.js', 'gulpfile.js', '.eslintrc.js'],
  overrides: [
    {
      files: ['package.json'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/community'],
      rules: { 'n8n-nodes-base/community-package-json-name-still-default': 'off' },
    },
    {
      files: ['./credentials/**/*.ts', './nodes/**/*.ts'],
      plugins: ['eslint-plugin-n8n-nodes-base'],
      extends: ['plugin:n8n-nodes-base/nodes'],
    },
  ],
};
```

- [ ] **Step 5: Write `.prettierrc.js`**

```js
module.exports = { semi: true, trailingComma: 'all', singleQuote: true, printWidth: 100, tabWidth: 2, useTabs: true };
```

- [ ] **Step 6: Write `gulpfile.js`** (copy node/credential SVG icons into dist)

```js
const { src, dest } = require('gulp');
function buildIcons() {
  return src('{nodes,credentials}/**/*.{png,svg}', { base: '.' }).pipe(dest('dist'));
}
exports['build:icons'] = buildIcons;
```

- [ ] **Step 7: Write `jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
```

- [ ] **Step 8: Write `index.ts`** (empty module marker — n8n loads from the `n8n` manifest, not this file, but npm `main` needs it)

```ts
module.exports = {};
```

- [ ] **Step 9: Write `LICENSE`** (MIT, holder "Grzegorz Grzywacz", year 2026) and `.npmignore`

`.npmignore`:
```
*
!dist/**/*
```

- [ ] **Step 10: Install deps and verify tooling**

Run: `cd ~/git/pingwa/n8n-nodes && npm install`
Expected: installs without error; `node_modules/` present (already git-ignored).

- [ ] **Step 11: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "chore: scaffold n8n node package toolchain"
```

---

### Task 2: `PingwaApi` credential (manual key) + test request

**Files:**
- Create: `credentials/PingwaApi.credentials.ts`

- [ ] **Step 1: Write the credential class**

```ts
import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class PingwaApi implements ICredentialType {
  name = 'pingwaApi';
  displayName = 'Pingwa API';
  documentationUrl = 'https://pingwa.dev';
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
```

- [ ] **Step 2: Verify it compiles + lints**

Run: `cd ~/git/pingwa/n8n-nodes && npm run build && npm run lint`
Expected: `dist/credentials/PingwaApi.credentials.js` produced; lint reports no errors for the credential.

- [ ] **Step 3: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: PingwaApi credential (manual key) with /v1/me test"
```

---

### Task 3: `pingwaApiRequest` helper + error mapping (TDD)

**Files:**
- Create: `nodes/shared/GenericFunctions.ts`
- Test: `nodes/shared/GenericFunctions.errormap.test.ts`

The pingwa error envelope is `{error, message, action}`. We map it to a readable message. This task tests only the *pure* mapping function `mapPingwaError`; the request wrapper itself is thin and exercised in the staging smoke test.

- [ ] **Step 1: Write the failing test**

```ts
import { mapPingwaError } from './GenericFunctions';

describe('mapPingwaError', () => {
  it('joins message and action from the pingwa envelope', () => {
    const out = mapPingwaError({ error: 'quota_exceeded', message: 'Out of quota.', action: 'Upgrade to Pro.' });
    expect(out).toBe('Out of quota. Upgrade to Pro.');
  });

  it('falls back to the error code when no message', () => {
    expect(mapPingwaError({ error: 'boom' })).toBe('boom');
  });

  it('returns a generic string for a non-envelope body', () => {
    expect(mapPingwaError('nope')).toBe('Pingwa request failed');
    expect(mapPingwaError(undefined)).toBe('Pingwa request failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/git/pingwa/n8n-nodes && npx jest GenericFunctions.errormap -v`
Expected: FAIL — `mapPingwaError` not exported.

- [ ] **Step 3: Write minimal implementation**

Create `nodes/shared/GenericFunctions.ts`:

```ts
import type {
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
  IPollFunctions,
  IWebhookFunctions,
  IHttpRequestMethods,
  IHttpRequestOptions,
  IDataObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type PingwaEnvelope = { error?: string; message?: string; action?: string };

export function mapPingwaError(body: unknown): string {
  if (body && typeof body === 'object') {
    const e = body as PingwaEnvelope;
    const parts = [e.message, e.action].filter((s): s is string => typeof s === 'string' && s.length > 0);
    if (parts.length) return parts.join(' ');
    if (typeof e.error === 'string' && e.error.length) return e.error;
  }
  return 'Pingwa request failed';
}

type RequestContext =
  | IExecuteFunctions
  | IHookFunctions
  | ILoadOptionsFunctions
  | IPollFunctions
  | IWebhookFunctions;

/**
 * One request path for the whole package. Resolves the base URL from whichever
 * pingwa credential the node is configured with, and turns a pingwa error
 * envelope into a readable NodeApiError. Set `acceptStatuses` to treat some
 * non-2xx codes (e.g. 408 long-poll timeout) as normal returns, not errors.
 */
export async function pingwaApiRequest(
  this: RequestContext,
  method: IHttpRequestMethods,
  path: string,
  body?: IDataObject,
  qs?: IDataObject,
  headers?: Record<string, string>,
  acceptStatuses: number[] = [],
): Promise<IDataObject> {
  // 'authentication' is a static node option (same for every item), so reading it at
  // item index 0 is correct in execute context; hook/poll/webhook contexts ignore the
  // index for a non-expression parameter. Cast because `this` is a union of contexts.
  let credName = 'pingwaApi';
  try {
    const v = (this as IExecuteFunctions).getNodeParameter('authentication', 0, 'pingwaApi') as string;
    if (v === 'pingwaOAuth2Api') credName = 'pingwaOAuth2Api';
  } catch {
    // node without an 'authentication' option — default to the API-key credential
  }
  const creds = await this.getCredentials(credName);
  const baseUrl = ((creds.baseUrl as string) || 'https://pingwa.dev').replace(/\/$/, '');

  const options: IHttpRequestOptions = {
    method,
    url: `${baseUrl}${path}`,
    body,
    qs,
    headers,
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  };

  const response = await this.helpers.httpRequestWithAuthentication.call(this, credName, options);
  const status = response.statusCode as number;
  if (status >= 200 && status < 300) return response.body as IDataObject;
  if (acceptStatuses.includes(status)) return { __status: status, ...(response.body as IDataObject) };

  throw new NodeApiError(this.getNode(), response.body as IDataObject, {
    message: mapPingwaError(response.body),
    httpCode: String(status),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest GenericFunctions.errormap -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: pingwaApiRequest helper + error envelope mapping"
```

---

### Task 4: `verifyPingwaSignature` (TDD)

**Files:**
- Modify: `nodes/shared/GenericFunctions.ts`
- Test: `nodes/shared/GenericFunctions.signature.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { createHmac } from 'crypto';
import { verifyPingwaSignature } from './GenericFunctions';

const secret = 'whsec_testsecret';
const raw = Buffer.from(JSON.stringify({ event: 'inbound_message', body: 'hi' }));
const good = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');

describe('verifyPingwaSignature', () => {
  it('accepts a correct signature', () => {
    expect(verifyPingwaSignature(raw, good, secret)).toBe(true);
  });
  it('rejects a tampered body', () => {
    expect(verifyPingwaSignature(Buffer.from('{"body":"evil"}'), good, secret)).toBe(false);
  });
  it('rejects a wrong secret', () => {
    expect(verifyPingwaSignature(raw, good, 'whsec_other')).toBe(false);
  });
  it('rejects a missing or malformed header', () => {
    expect(verifyPingwaSignature(raw, undefined, secret)).toBe(false);
    expect(verifyPingwaSignature(raw, 'garbage', secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest GenericFunctions.signature -v`
Expected: FAIL — `verifyPingwaSignature` not exported.

- [ ] **Step 3: Add the implementation to `GenericFunctions.ts`**

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyPingwaSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

(Add `createHmac, timingSafeEqual` to the existing `crypto` import; the file already imports nothing from crypto yet, so add `import { createHmac, timingSafeEqual } from 'crypto';` at the top.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest GenericFunctions.signature -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: verifyPingwaSignature HMAC check"
```

---

### Task 5: `inboxToItems` mapping (TDD)

**Files:**
- Modify: `nodes/shared/GenericFunctions.ts`
- Test: `nodes/shared/GenericFunctions.inbox.test.ts`

Both triggers must emit the SAME item shape so downstream workflows are transport-agnostic. `inboxToItems` normalizes an inbox row (from `GET /v1/inbox`) into the same object the webhook delivers. `filterEvents` applies the "replies only" option.

- [ ] **Step 1: Write the failing test**

```ts
import { inboxToItems, filterReplies } from './GenericFunctions';

const rows = [
  { id: 'm1', body: 'yes', button_id: null, reply_to_message_id: 'q1', wa_message_id: 'wamid.1', created_at: '2026-07-20T10:00:00Z' },
  { id: 'm2', body: 'hello', button_id: null, reply_to_message_id: null, wa_message_id: 'wamid.2', created_at: '2026-07-20T10:01:00Z' },
];

describe('inboxToItems', () => {
  it('maps rows to the webhook-shaped payload with event=inbound_message', () => {
    const out = inboxToItems(rows);
    expect(out).toEqual([
      { event: 'inbound_message', message_id: 'm1', body: 'yes', button_id: null, reply_to_message_id: 'q1', wa_message_id: 'wamid.1', created_at: '2026-07-20T10:00:00Z' },
      { event: 'inbound_message', message_id: 'm2', body: 'hello', button_id: null, reply_to_message_id: null, wa_message_id: 'wamid.2', created_at: '2026-07-20T10:01:00Z' },
    ]);
  });
  it('returns [] for empty input', () => {
    expect(inboxToItems([])).toEqual([]);
  });
});

describe('filterReplies', () => {
  it('keeps only rows that reply to an outbound message', () => {
    const out = filterReplies(inboxToItems(rows));
    expect(out.map((r) => r.message_id)).toEqual(['m1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest GenericFunctions.inbox -v`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Add the implementation to `GenericFunctions.ts`**

```ts
export interface InboxRow {
  id: string;
  body: string | null;
  button_id: string | null;
  reply_to_message_id: string | null;
  wa_message_id: string | null;
  created_at: string | null;
}

export interface InboundItem {
  event: 'inbound_message';
  message_id: string;
  body: string | null;
  button_id: string | null;
  reply_to_message_id: string | null;
  wa_message_id: string | null;
  created_at: string | null;
}

export function inboxToItems(rows: InboxRow[]): InboundItem[] {
  return rows.map((r) => ({
    event: 'inbound_message',
    message_id: r.id,
    body: r.body,
    button_id: r.button_id,
    reply_to_message_id: r.reply_to_message_id,
    wa_message_id: r.wa_message_id,
    created_at: r.created_at,
  }));
}

export function filterReplies(items: InboundItem[]): InboundItem[] {
  return items.filter((i) => i.reply_to_message_id !== null && i.reply_to_message_id !== undefined);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest GenericFunctions.inbox -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: inboxToItems + filterReplies mapping"
```

---

### Task 6: `Pingwa` action node — Notify operation

**Files:**
- Create: `nodes/Pingwa/Pingwa.node.ts`, `nodes/Pingwa/pingwa.svg`

- [ ] **Step 1: Add an icon**

Create `nodes/Pingwa/pingwa.svg` — a simple square SVG placeholder (real logo comes in Task 13):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect width="24" height="24" rx="5" fill="#25D366"/><path d="M7 12h10M12 7v10" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
```

- [ ] **Step 2: Write the node with only the Notify operation**

```ts
import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
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
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
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
          { name: 'Notify', value: 'notify', action: 'Send a notification', description: 'Fire-and-forget WhatsApp message' },
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
```

- [ ] **Step 3: Build + lint**

Run: `npm run build && npm run lint`
Expected: builds; lint clean (n8n ruleset checks displayName casing, icon, etc.).

- [ ] **Step 4: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: Pingwa node with Notify operation"
```

---

### Task 7: `Pingwa` node — Ask operation (blocking HITL)

**Files:**
- Modify: `nodes/Pingwa/Pingwa.node.ts`

- [ ] **Step 1: Add the Ask option + its parameters**

In `operation.options`, add after `notify`:
```ts
{ name: 'Ask', value: 'ask', action: 'Ask a question and wait for a reply', description: 'Send a question and block until the human answers (or timeout)' },
```
Add these properties (append to `properties`):
```ts
{
  displayName: 'Question',
  name: 'askText',
  type: 'string',
  typeOptions: { rows: 3 },
  default: '',
  required: true,
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
```

- [ ] **Step 2: Add the Ask branch to `execute`** (inside the try, after the notify branch)

```ts
if (operation === 'ask') {
  const body: IDataObject = { text: this.getNodeParameter('askText', i) as string };
  const buttons = this.getNodeParameter('buttons', i, []) as string[];
  if (buttons.length) body.buttons = buttons;
  const timeout = this.getNodeParameter('timeout', i, 0) as number;
  if (timeout > 0) body.timeout = timeout;
  const onTimeout = this.getNodeParameter('onTimeout', i, 'continue') as string;

  const res = await pingwaApiRequest.call(this, 'POST', '/v1/ask', body, undefined, undefined, [408]);
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
```

- [ ] **Step 3: Add `NodeOperationError` to imports**

Change the import to: `import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';`

- [ ] **Step 4: Build + lint**

Run: `npm run build && npm run lint`
Expected: builds + lint clean.

- [ ] **Step 5: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: Pingwa Ask operation with on-timeout handling"
```

---

### Task 8: `Pingwa` node — Get Reply operation (non-blocking)

**Files:**
- Modify: `nodes/Pingwa/Pingwa.node.ts`

- [ ] **Step 1: Add the Get Reply option + parameters**

In `operation.options` add:
```ts
{ name: 'Get Reply', value: 'getReply', action: 'Get the reply to a message', description: 'Fetch the human reply to a previously sent message' },
```
Append properties:
```ts
{
  displayName: 'Message ID',
  name: 'messageId',
  type: 'string',
  default: '',
  required: true,
  description: 'The id returned by a prior Ask or Notify',
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
```

- [ ] **Step 2: Add the Get Reply branch to `execute`**

```ts
if (operation === 'getReply') {
  const messageId = this.getNodeParameter('messageId', i) as string;
  const wait = this.getNodeParameter('replyWait', i, 0) as number;
  const qs: IDataObject = wait > 0 ? { wait } : {};
  const res = await pingwaApiRequest.call(
    this, 'GET', `/v1/messages/${encodeURIComponent(messageId)}/reply`, undefined, qs, undefined, [408],
  );
  if ((res.__status as number) === 408) {
    out.push({ json: { answered: false, message_id: messageId }, pairedItem: { item: i } });
  } else {
    out.push({ json: res, pairedItem: { item: i } });
  }
}
```

- [ ] **Step 3: Build + lint**

Run: `npm run build && npm run lint`
Expected: builds + lint clean.

- [ ] **Step 4: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: Pingwa Get Reply operation"
```

---

### Task 9: `PingwaTrigger` — webhook trigger (default)

**Files:**
- Create: `nodes/PingwaTrigger/PingwaTrigger.node.ts`, `nodes/PingwaTrigger/pingwa.svg` (copy of Task 6 svg)

Webhook lifecycle registers the n8n-generated URL with pingwa (`POST /v1/webhooks`), stores the returned `secret` + `id` in node static data, verifies `X-Pingwa-Signature` on each delivery, and deletes the subscription on deactivation.

- [ ] **Step 1: Copy the icon**

Run: `cp ~/git/pingwa/n8n-nodes/nodes/Pingwa/pingwa.svg ~/git/pingwa/n8n-nodes/nodes/PingwaTrigger/pingwa.svg`

- [ ] **Step 2: Write the trigger node**

```ts
import type {
  IHookFunctions,
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  IDataObject,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { pingwaApiRequest, filterReplies, verifyPingwaSignature, InboundItem } from '../shared/GenericFunctions';

export class PingwaTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingwa Trigger',
    name: 'pingwaTrigger',
    icon: 'file:pingwa.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts the workflow when someone replies on WhatsApp via pingwa (webhook)',
    defaults: { name: 'Pingwa Trigger' },
    inputs: [],
    outputs: [NodeConnectionType.Main],
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
```

> **n8n note for the implementer:** `rawBody: true` on the webhook descriptor is what
> makes `req.rawBody` available — this is set from the start (not a contingency) because
> the signature check CANNOT work any other way: pingwa signs Python `json.dumps` output
> and JS `JSON.stringify` produces different bytes (no spaces after `:`/`,`), so any
> re-serialize path is guaranteed to mismatch. If `req.rawBody` is still undefined at
> runtime on the target n8n version, that is the thing to debug in Task 14 — do NOT add a
> re-serialize fallback (it will silently reject every valid delivery). The header key is
> lower-cased by n8n (`x-pingwa-signature`).

- [ ] **Step 3: Build + lint**

Run: `npm run build && npm run lint`
Expected: builds + lint clean.

- [ ] **Step 4: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: PingwaTrigger webhook node with signature verification"
```

---

### Task 10: `PingwaPollTrigger` — polling trigger (LAN fallback)

**Files:**
- Create: `nodes/PingwaPollTrigger/PingwaPollTrigger.node.ts`, `nodes/PingwaPollTrigger/pingwa.svg` (copy)

- [ ] **Step 1: Copy the icon**

Run: `cp ~/git/pingwa/n8n-nodes/nodes/Pingwa/pingwa.svg ~/git/pingwa/n8n-nodes/nodes/PingwaPollTrigger/pingwa.svg`

- [ ] **Step 2: Write the poll trigger**

```ts
import type {
  IPollFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  IDataObject,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { pingwaApiRequest, inboxToItems, filterReplies, InboxRow } from '../shared/GenericFunctions';

export class PingwaPollTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Pingwa Poll Trigger',
    name: 'pingwaPollTrigger',
    icon: 'file:pingwa.svg',
    group: ['trigger'],
    version: 1,
    polling: true,
    description: 'Polls pingwa for inbound WhatsApp messages (use when n8n has no public URL)',
    defaults: { name: 'Pingwa Poll Trigger' },
    inputs: [],
    outputs: [NodeConnectionType.Main],
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
      },
    ],
  };

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const data = this.getWorkflowStaticData('node');
    const isManual = this.getMode() === 'manual';
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
```

> **Known gap (documented):** `GET /v1/inbox` rows do NOT carry `media` or `window_open`
> (per the backend contract), so the poll trigger cannot surface inbound media or the
> window state — the webhook trigger can (it emits pingwa's raw payload, which includes
> both). Acceptable: the webhook trigger is the default; poll is the LAN fallback. Note
> this in the README so poll users know media is webhook-only.

- [ ] **Step 3: Build + lint**

Run: `npm run build && npm run lint`
Expected: builds + lint clean.

- [ ] **Step 4: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: PingwaPollTrigger polling node with inbox cursor"
```

---

### Task 11: `PingwaOAuth2Api` credential (one-click)

**Files:**
- Create: `credentials/PingwaOAuth2Api.credentials.ts`

Depends on Repo B being live (the `/oauth/authorize` + `/oauth/token` endpoints and public client `n8n`). The credential is declarative and can be committed before the server is deployed; the staging smoke test (Task 14) is where it is exercised end to end.

- [ ] **Step 1: Write the credential**

```ts
import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class PingwaOAuth2Api implements ICredentialType {
  name = 'pingwaOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Pingwa OAuth2 API';
  documentationUrl = 'https://pingwa.dev';
  properties: INodeProperties[] = [
    { displayName: 'Grant Type', name: 'grantType', type: 'hidden', default: 'pkce' },
    { displayName: 'Client ID', name: 'clientId', type: 'hidden', default: 'n8n' },
    { displayName: 'Client Secret', name: 'clientSecret', type: 'hidden', default: '' },
    { displayName: 'Scope', name: 'scope', type: 'hidden', default: 'send inbox' },
    { displayName: 'Authentication', name: 'authentication', type: 'hidden', default: 'header' },
    // Visible so self-host / staging can retarget. Defaults = prod; most users never touch them.
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://pingwa.dev',
      description: 'pingwa API base for /v1 calls. Change only for self-host or staging.',
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
      type: 'string',
      default: 'https://pingwa.dev/oauth/token',
    },
  ];
}
```

> **Implementer note:** n8n's `oAuth2Api` base with `grantType: 'pkce'` performs the PKCE
> dance (code_challenge/verifier) itself — do NOT hand-roll PKCE query params (that is why
> `authQueryParameters` is dropped). Confirm the target n8n supports the `pkce` grant value
> (n8n ≥ ~0.220 / current 1.x do); if a very old n8n is a target, fall back to
> `grantType: 'authorizationCode'` with manual PKCE params. The `scope` string is passed
> through and echoed by `/oauth/token` but NOT validated server-side — keep it equal to the
> server for tidiness, nothing enforces it. The access token is a non-expiring `pw_` key, so
> no refresh is configured; n8n keeps sending the stored bearer. `baseUrl` here is only read
> by `pingwaApiRequest` for `/v1/*`; the OAuth `authUrl`/`accessTokenUrl` are separate visible
> fields (a staging user edits all three).

- [ ] **Step 2: Build + lint**

Run: `npm run build && npm run lint`
Expected: builds + lint clean.

- [ ] **Step 3: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "feat: PingwaOAuth2Api one-click credential (extends oAuth2Api)"
```

---

### Task 12: README + real icons

**Files:**
- Create: `README.md`
- Replace: the three `pingwa.svg` files with the real pingwa logo (from `~/git/pingwa/server/branding/` if a square logo exists; else keep the placeholder)

- [ ] **Step 1: Write `README.md`** with: what it is; install (`Settings → Community Nodes → n8n-nodes-pingwa`); credential setup for BOTH types (send `join` for a key, or click Connect for OAuth2); the webhook-vs-poll decision guide ("use the webhook trigger if your n8n is reachable on a public https URL; use the poll trigger otherwise"); a short example per node. Keep prose plain (Orwell rules — short words, active voice, cut what can be cut).

- [ ] **Step 2: Drop in the real logo if available**

Run: `ls ~/git/pingwa/server/branding/*.svg` — if a square mark exists, copy it over the three placeholders; otherwise leave placeholders.

- [ ] **Step 3: Build + lint + full test**

Run: `npm run build && npm run lint && npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git -C ~/git/pingwa/n8n-nodes add -A
git -C ~/git/pingwa/n8n-nodes commit -m "docs: README + node icons"
```

---

### Task 13: Local n8n load test (nodes appear + credential form renders)

**Files:** none (manual verification)

- [ ] **Step 1: Link the package into a local n8n**

Run:
```bash
cd ~/git/pingwa/n8n-nodes && npm run build && npm link
mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm link n8n-nodes-pingwa
```

- [ ] **Step 2: Start n8n and confirm the nodes load**

Run: `npx n8n start` (or the user's existing n8n). Open the editor, add a node, search "Pingwa".
Expected: `Pingwa`, `Pingwa Trigger`, `Pingwa Poll Trigger` all appear with the icon. Opening each shows the expected operations/params. Creating a `Pingwa API` credential shows the notice + key field.

- [ ] **Step 3: Record the result**

No commit. If a node fails to load, fix the descriptor and rebuild before proceeding.

---

### Task 14: Staging end-to-end smoke test (both credentials, both triggers)

**Files:** none (manual verification against `https://pingwa.grzgrzgrz3.ovh`, LAN-only)

**Precondition:** Repo B (server plan) OAuth2 endpoints deployed to staging; a test `pw_` key available (send `join` to the staging number, or mint via the panel).

- [ ] **Step 1: API-key path — Notify + Ask**

Build a workflow: manual trigger → `Pingwa` Notify ("test") → confirm WhatsApp delivery. Then `Pingwa` Ask ("pick one", buttons A/B). Reply from the phone; confirm the node returns `{answered:true, reply:{...}}`.

- [ ] **Step 2: Webhook trigger**

Add `Pingwa Trigger`, activate the workflow. Confirm a subscription appears (`GET /v1/webhooks`). Send a WhatsApp reply; confirm the workflow fires with the payload. **If it does NOT fire or the signature check rejects:** apply the raw-body fix from Task 9's note (`rawBody: true` on the webhook descriptor + compare `req.rawBody` only), rebuild, retest. Deactivate; confirm the subscription is deleted.

- [ ] **Step 2b: Poll trigger**

Swap in `Pingwa Poll Trigger` (poll every minute). Send a reply; confirm it fires within one interval and does not re-emit the same message on the next poll (cursor works).

- [ ] **Step 3: OAuth2 one-click**

Create a `Pingwa OAuth2 API` credential, click **Connect my account**, complete the pingwa consent in the browser, confirm the credential saves and the `Pingwa` Notify op works using it.

- [ ] **Step 4: Record results in the plan**

Tick the boxes; note any deviations. Do not publish until all four pass.

---

### Task 15: Publish to npm + submit for n8n verification

**Files:** none

- [ ] **Step 1: Dry-run the package contents**

Run: `cd ~/git/pingwa/n8n-nodes && npm pack --dry-run`
Expected: the tarball contains only `dist/**` (compiled js + svg) + `package.json` + `README.md` + `LICENSE`. No `.ts` sources, no `docs/`, no tests.

- [ ] **Step 2: Store the npm token in gnome-keyring** (once)

Run (user provides the token): `secret-tool store --label='npm pingwa' service pingwa account npm-publish`

- [ ] **Step 3: Publish**

Run:
```bash
NPM_TOKEN=$(secret-tool lookup service pingwa account npm-publish)
cd ~/git/pingwa/n8n-nodes
npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
npm publish --access public
```
Expected: `n8n-nodes-pingwa@0.1.0` live on npm.

- [ ] **Step 4: Tag the release**

```bash
git -C ~/git/pingwa/n8n-nodes tag v0.1.0
```

- [ ] **Step 5: Submit for n8n verification**

Follow n8n's community-node verification submission (repo public on GitHub, lint clean, README present). This unlocks install on n8n Cloud. No code change; record the submission link in `~/claude/personal/kb/pingwa/todo.md`.

---

## Self-Review

- **Spec coverage:** credentials (1a manual ✓ Task 2, 1b OAuth2 ✓ Task 11), GenericFunctions (request ✓3, signature ✓4, inbox ✓5), action Notify/Ask/GetReply (✓6/7/8), webhook trigger (✓9), poll trigger (✓10), README/icons (✓12), publish + verify (✓15). Server-side OAuth2 AS is the separate server plan — referenced, not duplicated.
- **Type consistency:** `InboundItem`/`InboxRow` defined in Task 5, reused in Tasks 9/10. `pingwaApiRequest` signature (method, path, body, qs, headers, acceptStatuses) defined in Task 3, called with that arity in 6/7/8/9/10. `authentication` param name shared across all nodes + both credentials.
- **Placeholder scan:** no TBD/TODO; every code step has full code; commands have expected output. The one deferred detail (webhook rawBody handling) is an explicit conditional fix with exact instructions, gated on the staging test, not a placeholder.
- **Ordering:** OAuth2 credential (Task 11) is declarative and can be built before the server is live; it is only *exercised* in Task 14, which lists the server precondition.
