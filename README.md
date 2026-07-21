# n8n-nodes-pingwa

n8n community node for [pingwa](https://pingwa.dev) — WhatsApp notifications and
human-in-the-loop for AI agents and workflows. Send a message, ask a question and
wait for a human's answer, or fetch a reply later. Two triggers pick up inbound
WhatsApp messages: a webhook trigger and a poll trigger.

## Install

In n8n: **Settings → Community Nodes → Install**, then enter:

```
n8n-nodes-pingwa
```

n8n installs the package and the `Pingwa`, `Pingwa Trigger`, and `Pingwa Poll
Trigger` nodes appear in the node panel.

## Credentials

Every node needs a pingwa credential. Pick one of two types.

### API Key (fastest)

1. Open WhatsApp and send the word `join` to the pingwa number.
2. Pingwa replies with your API key (`pw_...`).
3. In n8n, add a **Pingwa API** credential and paste the key.

Leave **Base URL** at its default (`https://pingwa.dev`) unless you run a
self-hosted or staging instance.

### OAuth2 (one-click)

1. In n8n, add a **Pingwa OAuth2 API** credential.
2. Click **Connect my account**.
3. Approve the request in the browser tab that opens.

n8n stores and refreshes the token. No key to copy.

## Webhook vs. poll trigger

Use **Pingwa Trigger** (webhook) if your n8n instance is reachable on a public
`https` URL. Pingwa registers a webhook on activation and pushes each inbound
message the moment it arrives.

Use **Pingwa Poll Trigger** if n8n has no public URL (local, LAN-only, behind a
firewall). It pulls `/v1/inbox` on an interval instead.

One gap to know: inbound media (images, voice notes, attachments) arrives only
through the webhook. Poll rows carry text, button clicks, and reply
references, but no media field — pingwa does not backfill it into the poll
inbox.

## Node examples

### Pingwa — Notify

Fire-and-forget message, no reply expected.

- **Operation**: Notify
- **Message**: `Backup finished: 42 GB in 6 minutes.`
- **Image URL**: optional, must be public `https`
- **Idempotency Key**: optional; resending with the same key does not send twice

Output: `{ id, billing_class, status }`

### Pingwa — Ask

Send a question and block the workflow until the human answers, or until
timeout.

- **Operation**: Ask
- **Question**: `Approve the $4,200 refund?`
- **Buttons**: `Approve`, `Reject`
- **Timeout (Seconds)**: `0` for the server default, or set your own
- **On Timeout**: continue with an empty reply, or fail the node

Output: `{ message_id, billing_class, answered, reply }`. On timeout with
"Continue" selected: `{ answered: false, timedOut: true, message_id }`.

### Pingwa — Get Reply

Fetch the reply to a message sent earlier (by Ask or Notify).

- **Operation**: Get Reply
- **Message ID**: the `id` from a prior Notify or Ask
- **Wait (Seconds)**: long-poll up to this many seconds; `0` returns immediately

Output: `{ message_id, answered, reply }`.

### Pingwa Trigger (webhook)

Add the node, pick **Events** (All Inbound Messages or Replies Only), and
activate the workflow. n8n registers the webhook with pingwa automatically and
removes it on deactivation. Each inbound WhatsApp message starts a new
execution with `{ event, message_id, body, button_id, reply_to_message_id,
wa_message_id, window_open, created_at, media? }`.

### Pingwa Poll Trigger

Add the node, pick **Events**, and activate. n8n polls `/v1/inbox` on its
configured interval and starts an execution for each new row since the last
poll. Same fields as the webhook trigger, minus `window_open` and `media`
(the `/v1/inbox` endpoint does not return them).

## License

MIT
