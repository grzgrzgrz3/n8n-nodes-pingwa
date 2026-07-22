import type {
  IExecuteFunctions,
  IHookFunctions,
  ILoadOptionsFunctions,
  IPollFunctions,
  IWebhookFunctions,
  IHttpRequestMethods,
  IHttpRequestOptions,
  IDataObject,
  JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { createHmac, timingSafeEqual } from 'crypto';

type PingwaEnvelope = { error?: string; message?: string; action?: string };

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

/**
 * Split a pingwa error envelope into what happened (message) and how to fix it
 * (description), matching how n8n surfaces the two in the UI. `action` is the
 * remediation hint, so it belongs in the description, not glued onto the message.
 */
export function mapPingwaError(body: unknown): { message: string; description?: string } {
  if (body && typeof body === 'object') {
    const e = body as PingwaEnvelope;
    const message =
      e.message && e.message.length ? e.message : e.error && e.error.length ? e.error : undefined;
    const description = e.action && e.action.length ? e.action : undefined;
    if (message) return { message, description };
  }
  return { message: 'Pingwa did not accept the request' };
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
  timeoutMs?: number,
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
  // For long-poll calls (Ask/Get Reply) the client must outwait the server's poll,
  // else n8n's default request timeout aborts before the 408 comes back.
  if (timeoutMs && timeoutMs > 0) options.timeout = timeoutMs;

  const response = await this.helpers.httpRequestWithAuthentication.call(this, credName, options);
  const status = response.statusCode as number;
  if (status >= 200 && status < 300) return response.body as IDataObject;
  if (acceptStatuses.includes(status)) return { __status: status, ...(response.body as IDataObject) };

  const { message, description } = mapPingwaError(response.body);
  throw new NodeApiError(this.getNode(), response.body as JsonObject, {
    message,
    description,
    httpCode: String(status),
  });
}

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
