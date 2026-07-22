# n8n-nodes-pingwa

This is an n8n community node. It lets you use **[pingwa](https://pingwa.dev)** in
your n8n workflows.

pingwa is a hosted service that sends WhatsApp messages to **your own** phone and
reads your replies back. Your workflow notifies you, asks you to approve or reject
a step, and continues once you answer. It uses a WhatsApp number that pingwa hosts,
so you do not need a Meta Business account, your own phone number, or an API
review to get started.

[Installation](#installation) ·
[Operations](#operations) ·
[Credentials](#credentials) ·
[How this differs from the built-in WhatsApp node](#how-this-differs-from-the-built-in-whatsapp-node) ·
[Compatibility](#compatibility) ·
[Usage](#usage) ·
[Resources](#resources) ·
[Version history](#version-history)

## Installation

Follow the [community nodes installation
guide](https://docs.n8n.io/integrations/community-nodes/installation/). In n8n go
to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-pingwa
```

The `Pingwa`, `Pingwa Trigger`, and `Pingwa Poll Trigger` nodes then appear in the
node panel.

![Pingwa nodes in the n8n node panel](https://raw.githubusercontent.com/grzgrzgrz3/n8n-nodes-pingwa/main/docs/img/node-panel.png)

## Operations

### Pingwa: Notify

Send a message. No reply expected.

- **Message**: the text to send, for example `Backup finished: 42 GB in 6 minutes.`
- **Image URL**: optional. Must be a public `https` URL.
- **Idempotency Key**: optional. Resending with the same key does not send twice.

Output: `{ id, billing_class, status }`

### Pingwa: Ask

Send a question and hold the workflow until you answer, or until it times out.

- **Question**: for example `Approve the $4,200 refund?`
- **Buttons**: quick-reply titles, for example `Approve`, `Reject`
- **Timeout (Seconds)**: `0` uses the server default, or set your own
- **On Timeout**: continue with an empty reply, or fail the node

Output: `{ message_id, billing_class, answered, reply }`. On timeout with
"Continue" selected: `{ answered: false, timedOut: true, message_id }`.

![Pingwa Ask node configured with a question and Approve / Reject buttons](https://raw.githubusercontent.com/grzgrzgrz3/n8n-nodes-pingwa/main/docs/img/ask-node.png)

### Pingwa: Get Reply

Fetch the reply to a message you sent earlier, with Ask or Notify, without holding
an execution open.

- **Message ID**: the `id` from an earlier Notify or Ask
- **Wait (Seconds)**: wait up to this many seconds for a reply. `0` returns at once.

Output: `{ message_id, answered, reply }`

### Pingwa Trigger vs Pingwa Poll Trigger

Both start a workflow when a WhatsApp message comes in. Pick the one that matches
how your n8n is reachable.

- **Pingwa Trigger**: use this if n8n has a public `https` URL. pingwa registers a
  webhook when you activate the workflow and removes it when you deactivate. It
  pushes each message the moment it arrives. It emits `{ event, message_id, body,
  button_id, reply_to_message_id, wa_message_id, window_open, created_at, media? }`.
- **Pingwa Poll Trigger**: use this if n8n is local, LAN-only, or behind a
  firewall. It pulls `/v1/inbox` on an interval. It emits the same fields except
  `window_open` and `media`, because `/v1/inbox` does not return them. Inbound
  images and voice notes arrive only through the webhook.

Both have an **Events** option: All Inbound Messages or Replies Only.

## Credentials

pingwa offers two credentials. Pick one.

### Pingwa OAuth2 API (one click)

1. Add a **Pingwa OAuth2 API** credential and click **Connect**. There is nothing
   to fill in. The defaults target `pingwa.dev`.

   ![Pingwa OAuth2 credential with the Connect button](https://raw.githubusercontent.com/grzgrzgrz3/n8n-nodes-pingwa/main/docs/img/oauth-connect.png)

2. A pingwa tab opens. **Continue with Google**, or connect a number directly.

   ![Authorize n8n screen with Continue with Google](https://raw.githubusercontent.com/grzgrzgrz3/n8n-nodes-pingwa/main/docs/img/oauth-consent.png)

3. Choose which WhatsApp number n8n sends and receives on, or add a new one.

   ![Which number for n8n: pick an existing number or add a new one](https://raw.githubusercontent.com/grzgrzgrz3/n8n-nodes-pingwa/main/docs/img/oauth-pick-number.png)

4. For a new number only: tap **Open WhatsApp & verify** and send the pre-filled
   message, or scan the QR code from another phone. pingwa spots it and continues
   on its own. There is no code to type.

   ![Verify your WhatsApp screen with the Open WhatsApp and verify button](https://raw.githubusercontent.com/grzgrzgrz3/n8n-nodes-pingwa/main/docs/img/oauth-verify.png)

5. The tab closes and n8n stores the token.

If you pick a number that is already verified, you skip step 4.

### Pingwa API (paste a key)

1. Open WhatsApp and send `join` to the pingwa number.
2. pingwa replies with your key (`pw_...`).
3. Add a **Pingwa API** credential and paste it.

n8n's **Test** button checks the key against `GET /v1/me`, so a green tick means
the key works before you build anything.

> Leave **Base URL** at its default (`https://pingwa.dev`). Change it only if you
> run a self-hosted or staging pingwa.

## How this differs from the built-in WhatsApp node

n8n ships a built-in **WhatsApp Business Cloud** node. It and pingwa solve
different problems, and they work well side by side.

| | Built-in WhatsApp node | pingwa |
|---|---|---|
| Number | **Your own** WhatsApp Business number | A number **pingwa hosts** |
| Setup | Meta Business verification, phone number, app | Send `join` once, or click Connect |
| Who you message | Any customer who opted in | **Only your own linked WhatsApp** |
| Best for | Customer messaging at scale | Notifying **yourself** and approvals |

Use the built-in node to message customers from your own WhatsApp Business
account. Use pingwa when you want a workflow to ping **you**. There is no Meta
setup, and no way to message anyone but yourself, so there is no outreach or spam
surface.

## Compatibility

Built and tested against n8n node API version 1 (n8n 1.60 and later). Requires
Node.js 20.15 or later, which matches n8n's own runtime.

## Usage

- Notify and Ask are the two you reach for first. Use Notify for a one-way ping.
  Use Ask when the workflow must wait for your decision.
- Every operation supports **Continue On Fail**. Turn it on and a failed item
  emits `{ error }` instead of stopping the workflow.
- New to community nodes? See [Try it
  out](https://docs.n8n.io/try-it-out/) in the n8n docs.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [pingwa API documentation](https://pingwa.dev/docs)

## Version history

- **0.1.4**: Plainer wording in the README and node fields.
- **0.1.3**: README and node-panel polish (light and dark icon, labelled
  subtitles, field placeholders). Usable as an AI Agent tool. Published with npm
  provenance.
- **0.1.0**: first release. Notify, Ask, and Get Reply, webhook and poll triggers,
  API-key and OAuth2 credentials.

## License

MIT
