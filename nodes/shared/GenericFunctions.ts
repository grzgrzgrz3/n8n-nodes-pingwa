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

  throw new NodeApiError(this.getNode(), response.body as JsonObject, {
    message: mapPingwaError(response.body),
    httpCode: String(status),
  });
}
