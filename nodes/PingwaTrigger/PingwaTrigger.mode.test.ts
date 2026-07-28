import { PingwaTrigger } from './PingwaTrigger.node';

/**
 * n8n activates BOTH delivery paths for this node: it registers the webhook because
 * the node declares `webhooks`, and it schedules polls because the node implements
 * `poll()`. Only the selected mode may do work — otherwise one inbound message is
 * emitted twice.
 */

const httpCalls: string[] = [];

function ctx(mode: string, extra: Record<string, unknown> = {}) {
  return {
    getNodeParameter: (name: string, fallback?: unknown) =>
      name === 'delivery' ? mode : (extra[name] ?? fallback),
    getWorkflowStaticData: () => extra.staticData ?? {},
    getMode: () => 'trigger',
    getNode: () => ({ name: 'Pingwa Trigger' }),
    getNodeWebhookUrl: () => 'https://n8n.example/webhook/pingwa',
    getCredentials: async () => {
      httpCalls.push('getCredentials');
      return { baseUrl: 'https://pingwa.dev' };
    },
    helpers: {
      httpRequestWithAuthentication: async () => {
        httpCalls.push('http');
        return { statusCode: 200, body: {} };
      },
      returnJsonArray: (items: unknown[]) => items,
    },
    logger: { warn: () => {}, error: () => {} },
  };
}

beforeEach(() => {
  httpCalls.length = 0;
});

describe('mode gating', () => {
  const node = new PingwaTrigger();

  it('does not poll in webhook mode', async () => {
    const out = await node.poll.call(ctx('webhook') as never);
    expect(out).toBeNull();
    expect(httpCalls).toEqual([]);
  });

  it('polls in polling mode (first production poll only baselines the cursor)', async () => {
    const staticData: Record<string, unknown> = {};
    const out = await node.poll.call(ctx('poll', { staticData }) as never);
    expect(out).toBeNull();
    expect(typeof staticData.cursor).toBe('string');
    expect(httpCalls).toEqual([]);
  });

  it('registers no pingwa webhook subscription in polling mode', async () => {
    const exists = await node.webhookMethods.default.checkExists.call(ctx('poll') as never);
    expect(exists).toBe(true);
    expect(httpCalls).toEqual([]);
  });

  it('checks the subscription against the pingwa API in webhook mode', async () => {
    await node.webhookMethods.default.checkExists.call(ctx('webhook') as never);
    expect(httpCalls).toContain('http');
  });
});

describe('webhook teardown', () => {
  const node = new PingwaTrigger();

  it('logs and reports failure when the subscription cannot be deleted, but still clears local state', async () => {
    const warnings: string[] = [];
    const staticData: Record<string, unknown> = { webhookId: 'wh_1', webhookSecret: 's' };
    const failing = {
      ...ctx('webhook', { staticData }),
      getWorkflowStaticData: () => staticData,
      logger: { warn: (msg: string) => warnings.push(msg), error: () => {} },
      helpers: {
        httpRequestWithAuthentication: async () => {
          throw new Error('404 not found');
        },
        returnJsonArray: (items: unknown[]) => items,
      },
    };

    const ok = await node.webhookMethods.default.delete.call(failing as never);

    expect(ok).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(staticData.webhookId).toBeUndefined();
    expect(staticData.webhookSecret).toBeUndefined();
  });
});
