# n8n-nodes-pingwa — Design

Date: 2026-07-19
Status: approved (brainstorm), pre-implementation

## Purpose

A first-party n8n **community node package** for pingwa: send WhatsApp
notifications and human-in-the-loop questions from an n8n workflow, and trigger
workflows on inbound WhatsApp replies. Installed directly from n8n's *Community
Nodes* UI (`npm i n8n-nodes-pingwa`), which bypasses the curated template-gallery
gate entirely.

### Why this exists (strategic)

The validated pingwa/n8n gap is a **node package, not a template**. WAHA
distributes to n8n as a real community node (`@devlikeapro/n8n-nodes-waha`,
Action + Trigger) and owns that surface. pingwa currently exists in n8n only as
an importable template JSON — discoverable only if a user finds it in the
gallery. The cell nobody occupies: a **notify/ask + inbound-reply node backed by
the official WhatsApp Cloud API on pingwa's hosted number** — zero Docker, zero
Meta business-verification for the n8n user. Evolution API / WAHA push the
Meta-setup burden onto the user when they want official mode; pingwa removes it.

## Scope

This is a **two-repo project**; the first public npm release is gated on BOTH.

**Repo A — `n8n-nodes-pingwa` (node package):**
- Action node `Pingwa`: operations Notify, Ask, Get Reply.
- Trigger node `Pingwa Trigger`: webhook-based (default), auto-registers its
  webhook with pingwa.
- Trigger node `Pingwa Poll Trigger`: polling-based fallback for n8n instances
  with no public URL.
- Credentials `PingwaApi`: API key + base URL (guided-notice manual key).
- Credentials `PingwaOAuth2Api extends oAuth2Api`: one-click "Connect" (public
  PKCE client, baked-in auth/token URLs + client_id).

**Repo B — `pingwa` (server): pingwa becomes an OAuth2 Authorization Server**
so the node's one-click credential can mint a `pw_` key without copy-paste.
Backend IS modified here (contrast: everything under "Backend contract" below is
pre-existing and untouched). See the "OAuth2 Authorization Server" section.

**Out (later / not now):**
- Account management ops (list numbers, switch, key CRUD, billing).
- Multi-recipient / broadcast (outside the product).
- Media *sending* beyond `image_url` (inbound media is surfaced read-only via the
  signed proxy URL pingwa already returns).
- Token refresh / expiry: the OAuth2 access_token IS a non-expiring `pw_` key, so
  no refresh-token machinery. Revocation = delete the key in the pingwa panel.

## Backend contract (pingwa server — already built, do not modify)

Auth: `Authorization: Bearer pw_...` on every call. Base URL default
`https://pingwa.dev` (overridable in credentials for self-host/staging).

| Endpoint | Body / query | Response |
|---|---|---|
| `POST /v1/notify` (202) | `{text, image_url?}`, header `Idempotency-Key?` | `{id, billing_class, status:"queued"}` |
| `POST /v1/ask` | `{text, buttons?:string[], timeout?:int}`, `Idempotency-Key?` | blocks → `{message_id, billing_class, answered:true, reply}`; **408** `{error:"ask_timeout", message_id}` on timeout (question still delivered; late reply retrievable) |
| `GET /v1/messages/{id}/reply` | `?wait=<s>` | `{message_id, answered:true, reply}`; **408** `{error:"no_reply_yet"}` |
| `GET /v1/inbox` | `?since=<ISO cursor>&wait=<s>&limit=<1..100>` | `{messages:[{id, body, button_id, reply_to_message_id, wa_message_id, created_at}], cursor}` |
| `POST /v1/webhooks` (201) | `{url}` (public https only, host-safe) | `{id, url, secret:"whsec_...", active, created_at}` — **secret returned ONCE** |
| `GET /v1/webhooks` | — | `{webhooks:[{id,url,active,created_at,last_delivery_at,failure_count}]}` (no secret) |
| `DELETE /v1/webhooks/{id}` | — | `{deleted:true}` |
| `GET /v1/me` | — | account summary (used as credential test) |

Notes:
- `timeout` on ask is clamped server-side to `longpoll_max_wait`; it is a wait
  preference, excluded from the idempotency fingerprint.
- `buttons` on a cold send (no open 24h window) are folded into the message text
  as a numbered list by the server; the node just passes them through.
- `POST /v1/webhooks` **rejects loopback/private/non-https URLs (422)** and caps
  count per user (409). This is exactly why the poll trigger exists.

### Inbound webhook delivery (what the webhook trigger receives)

pingwa's worker POSTs one request per (inbound message × active subscription):
- `Content-Type: application/json`
- Header `X-Pingwa-Signature: sha256=<hex>` where
  `hex = HMAC_SHA256(key = subscription.secret, msg = raw_request_body_bytes)`
  (same construction as Meta's `X-Hub-Signature-256`).
- Body:
  ```json
  {
    "event": "inbound_message",
    "message_id": "...",
    "body": "text or null",
    "button_id": "id or null",
    "reply_to_message_id": "id or null",
    "wa_message_id": "...",
    "window_open": true,
    "created_at": "ISO-8601",
    "media": { "kind":"audio", "voice":false, "mime_type":"...", "url":"signed proxy url" }
  }
  ```
  `media` present only for media messages. Payload never contains api_key,
  secret, or the sender's phone number.
- Delivery retries with backoff; repeated exhaustion deactivates the
  subscription server-side.

## Components

### 1a. `credentials/PingwaApi.credentials.ts` (manual key)
- Fields: `apiKey` (string, `typeOptions.password:true`), `baseUrl` (string,
  default `https://pingwa.dev`). A `notice` property with the get-a-key steps
  ("Open WhatsApp, send `join` to the pingwa number, paste the `pw_` key here").
- `authenticate`: generic, inject header `Authorization: Bearer {{$credentials.apiKey}}`.
- `test`: `GET {{baseUrl}}/v1/me` → 200 = valid.

### 1b. `credentials/PingwaOAuth2Api.credentials.ts` (one-click)
- `extends: ['oAuth2Api']`. Hidden/defaulted fields so the user sees only a
  "Connect my account" button:
  - `grantType: authorizationCode`, `authUrl = https://pingwa.dev/oauth/authorize`,
    `accessTokenUrl = https://pingwa.dev/oauth/token`,
    `clientId = "n8n"` (fixed public client), `clientSecret = ""` (public client),
    `authQueryParameters` carrying PKCE (`code_challenge`/`method=S256`),
    `authentication: body`.
  - `baseUrl` still overridable for self-host/staging (rewrites auth/token URLs).
- Both nodes accept EITHER credential type (n8n `credentials: [{name:'pingwaApi'},
  {name:'pingwaOAuth2Api'}]`); `pingwaApiRequest` picks whichever is set and calls
  `httpRequestWithAuthentication` with that name. The nodes are otherwise identical
  regardless of auth source — this is why the OAuth2 work is additive.

### 2. `nodes/shared/GenericFunctions.ts`
- `pingwaApiRequest(method, path, body?, qs?)`: wraps
  `this.helpers.httpRequestWithAuthentication`, resolves `baseUrl` from creds,
  maps pingwa error bodies (`{error,message,action}`) into readable
  `NodeApiError`. Treat 408 specially (not a hard failure — see Ask/Get Reply).
- `verifyPingwaSignature(rawBody: Buffer, header: string, secret: string): boolean`:
  constant-time compare of `sha256=` + HMAC. **Pure function — unit tested.**
- `inboxToItems(messages, event="inbound_message")`: map inbox rows to trigger
  output items (normalize to the same shape as the webhook payload so both
  triggers emit identically). **Pure function — unit tested.**

### 3. `nodes/Pingwa/Pingwa.node.ts` (Action, `group:["output"]`)
Resource-less, `operation` dropdown:
- **Notify** — `text` (required), `imageUrl` (optional), `idempotencyKey`
  (optional; if empty, omit). → `POST /v1/notify`. Output: response JSON.
- **Ask** — `text` (required), `buttons` (fixedCollection/string list → `string[]`,
  optional), `timeout` (number, optional), `onTimeout` (options: `Error` |
  `Continue with empty reply`, default `Continue`). → `POST /v1/ask`. On 408:
  if `Continue`, emit `{answered:false, message_id, timedOut:true}`; if `Error`,
  throw. **Note in node description:** Ask holds the execution open up to the
  (server-clamped) timeout.
- **Get Reply** — `messageId` (required), `wait` (number, default 0). →
  `GET /v1/messages/{id}/reply`. On 408 with `wait=0`, emit `{answered:false}`.

Continue-on-fail supported; each input item processed independently.

### 4. `nodes/PingwaTrigger/PingwaTrigger.node.ts` (webhook, DEFAULT)
- Declares a `default` webhook. `webhookMethods.default`:
  - `checkExists`: `GET /v1/webhooks`, match by URL == this node's webhook URL.
  - `create`: `POST /v1/webhooks {url}`; store `{id, secret}` in
    `this.getWorkflowStaticData('node')`.
  - `delete`: `DELETE /v1/webhooks/{id}` using stored id; clear static data.
- `webhook()` handler: read raw body, `verifyPingwaSignature` against stored
  secret — mismatch → return `{noWebhookResponse}` 401 and do not emit. Valid →
  emit the payload as one item. Respond 200 fast.
- Option `events`: `All inbound` (default) | `Replies only`
  (`reply_to_message_id != null`).
- Failure mode surfaced in docs: if the n8n webhook URL is not public, `create`
  gets a 422 from pingwa → node activation fails with a clear message pointing to
  the Poll Trigger.

### 5. `nodes/PingwaPollTrigger/PingwaPollTrigger.node.ts` (polling, `polling:true`)
- `poll()`: read `cursor` from static data; `GET /v1/inbox?since=<cursor>&limit=100`
  (no long-poll wait — n8n owns the schedule interval). Advance cursor to the
  returned `cursor`. Emit each message via `inboxToItems`. Empty → return `null`.
- Manual/test execution: fetch latest without advancing the persisted cursor.
- Same `events` filter option as the webhook trigger.

## OAuth2 Authorization Server (Repo B — pingwa server, NEW work)

Goal: n8n's genericOAuth2 "Connect" button → user approves in browser → n8n
receives a token that works as a pingwa API credential, with no copy-paste.

**Token semantics (the simplifier):** the OAuth2 `access_token` returned to n8n
IS a freshly minted, non-expiring `pw_` API key. Consequences: `auth.py`
unchanged (already accepts `pw_`); no refresh token; no expiry; revocation =
delete the key in the panel (n8n then 401s). The OAuth2 flow's ONLY job is
"authenticate the human + mint a labelled key".

**Reuse:** `oauth.py` PKCE (`code_challenge`, `new_code_verifier`) + signed
stateless tokens (`sign_state`/`verify_state`); `auth.generate_api_key`;
`registrations_api._callback_host_is_safe` for redirect-host safety.

**New endpoints (server-rendered, NOT the SPA):**
- `GET /oauth/authorize?response_type=code&client_id=n8n&redirect_uri=<n8n cb>&`
  `state=&code_challenge=&code_challenge_method=S256`
  1. Validate `client_id == "n8n"`, `redirect_uri` is https + host-safe (reject
     loopback/private → open-redirect guard), PKCE params present.
  2. **Authenticate the human.** pingwa has no browser cookie session (SPA uses
     header JWT), so this endpoint serves its OWN minimal server-rendered
     **login + consent page** (email/password; optionally "log in with Google"
     reusing the existing social flow). Consent text names the redirect host
     explicitly: "Allow n8n at `<host>` to send WhatsApp messages as you?"
  3. On approve: mint a single-use, short-TTL authorization `code` =
     `sign_state({uid, code_challenge, redirect_uri, jti})`; single-use enforced
     via a `jti` consumed-nonce row (reuse the idempotency/replay-guard pattern).
     Redirect to `redirect_uri?code=&state=`.
- `POST /oauth/token` (`grant_type=authorization_code`)
  1. Verify `code` signature+TTL, `redirect_uri` matches the one in the code,
     `code_verifier` hashes to the stored `code_challenge`, `jti` not yet consumed
     (consume it now — single use).
  2. Mint a `pw_` API key for `uid`, labelled `n8n (<redirect host>)`.
  3. Return `{access_token: "pw_...", token_type: "Bearer"}` (no `expires_in`,
     no `refresh_token`).

**Client model:** one fixed **public** client `client_id="n8n"`, PKCE-required,
no client secret (it would ship in a public npm package — useless as a secret).
`redirect_uri` cannot be pre-allowlisted (every self-hosted n8n has a different
host: `https://<host>/rest/oauth2-credential/callback`), so any https host-safe
URI is accepted; the consent screen naming the host is the phishing control.

**Security review is mandatory** (`security-review.md` discipline) before this
ships — new auth surface, arbitrary redirect host, a new server-rendered login
page. Threats to cover: open redirect, authorization-code
interception/replay (PKCE + single-use jti), consent phishing (host display),
CSRF on the consent POST (signed form nonce), login-page rate limiting.

## Data flow

```
Workflow → Pingwa (Notify)      → POST /v1/notify → WhatsApp
Workflow → Pingwa (Ask)         → POST /v1/ask (blocks) → reply → downstream nodes
Human replies on WhatsApp
   → Meta → pingwa server → deliver_inbound_webhook (signed POST)
       → Pingwa Trigger (verify sig) → workflow run
   OR (LAN n8n) pingwa server persists inbound
       → Pingwa Poll Trigger (GET /v1/inbox on schedule) → workflow run
```

## Error handling

- pingwa error envelope `{error, message, action}` → `NodeApiError` with
  `message` as the human line and `action` in the description.
- 402 (quota) / 401 (bad key) surfaced verbatim; not retried by the node.
- Ask/Get-Reply 408 = *not delivered-failure* → controlled by `onTimeout`.
- Webhook signature mismatch = silent 401, no emit (prevents forged triggers).

## Testing (TDD)

Pure-function unit tests first (jest or vitest), then node wiring:
1. `verifyPingwaSignature` — valid sig passes; tampered body/secret fails;
   malformed header fails; constant-time path exercised.
2. `inboxToItems` — inbox rows and webhook payload map to the identical item
   shape; media block preserved; empty list → [].
3. `pingwaApiRequest` error mapping — pingwa envelope → NodeApiError fields;
   408 passthrough flag.
4. Ask `onTimeout` branching (Error vs Continue) given a 408.
Static gates: `eslint-plugin-n8n-nodes-base` (n8n's own ruleset) clean, `tsc`
build clean. These two are the primary net for node-metadata correctness
(n8n verification checks them).

Server (Repo B, `pytest` per repo norm): `/oauth/token` — valid code+verifier
mints a working `pw_` key; wrong verifier / expired code / reused jti / mismatched
redirect_uri all rejected. `/oauth/authorize` — non-safe redirect_uri rejected,
consent CSRF nonce enforced, unauthenticated hit shows login not a code.

## Packaging / publish

- `package.json`: `name:"n8n-nodes-pingwa"`, `keywords` include
  `n8n-community-node-package` (required for n8n verified listing), `n8n.nodes`
  + `n8n.credentials` manifest pointing at compiled `dist/**`.
- Build: `tsc` + copy node SVG icons to `dist` (gulp or a small copy script).
- License MIT.
- Clean-room: no 360dialog strings anywhere; repo git identity
  `grzgrzgrz3@gmail.com`; public repo → commits carry `Co-Authored-By` but **no**
  `Claude-Session:` trailer.
- npm publish token in gnome-keyring `service=pingwa account=npm-publish`
  (mirror of the PyPI token convention). `scripts/publish.sh` reads it via
  `secret-tool`.
- README: install steps, credential setup (where to get a `pw_` key — send
  `join` on WhatsApp / signup), webhook-vs-poll decision guide, one screenshot of
  each node.

## Open decisions (resolved)

- **Two trigger nodes, not one mode-toggle node.** n8n activation branches on
  node type (webhook vs `polling:true`); a single class cannot cleanly be both.
- **Webhook is the default/primary trigger**, poll is the documented LAN
  fallback. n8n is a webhook-first server platform (unlike Home Assistant), so
  the public-URL assumption holds for the majority; poll covers the rest.
- **Get Reply is in v1** — completes the non-blocking HITL loop (ask without
  holding an execution open).
- **Easy-setup = OAuth2 one-click, shipped in the first release** (not deferred).
  n8n's credential UI cannot reproduce Home Assistant's polling config-flow
  wizard, so the n8n-idiomatic equivalent is a genericOAuth2 "Connect" button —
  which requires pingwa to become an OAuth2 Authorization Server (Repo B). The
  manual-key `PingwaApi` credential still ships alongside it as the no-OAuth
  fallback. Both phases gate the first publish.

## Milestones for the plan

First public npm publish is gated on BOTH repos (M1–M6 node + M7–M9 server).

**Repo A — node package:**
1. Repo scaffold: package.json, tsconfig, eslint (n8n ruleset), build script,
   LICENSE, empty dist wiring; `PingwaApi` credential (guided notice) + `/v1/me`
   test.
2. `GenericFunctions` (request helper + signature verify + inboxToItems + credential
   picker) with unit tests.
3. `Pingwa` action node (Notify → Ask → Get Reply) + tests.
4. `Pingwa Trigger` (webhook lifecycle + signature-verified receive).
5. `Pingwa Poll Trigger` (inbox cursor polling).
6. `PingwaOAuth2Api` credential (extends oAuth2Api, baked-in URLs/client_id/PKCE);
   nodes accept either credential.

**Repo B — pingwa server (OAuth2 AS), TDD per repo norm, feature branch:**
7. `POST /oauth/token` + code/PKCE/jti logic + key minting (pure + API tests).
8. `GET /oauth/authorize` + server-rendered login+consent page + redirect-host
   safety + CSRF nonce.
9. **security-review.md pass** on the new auth surface (blocking).

**Integration + release:**
10. README + icons; local `n8n` smoke test of BOTH credentials against staging
    (`https://pingwa.grzgrzgrz3.ovh`): manual-key path AND one-click Connect path.
11. Server: deploy AS to prod via `scripts/release.sh` (never by hand).
12. Node: publish dry-run (`npm pack` inspect) → first `npm publish` + tag.
13. Submit to n8n verified-nodes program (lint/docs/security criteria already met).
