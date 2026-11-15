import { Pingwa } from './Pingwa.node';

type Sent = { method: string; url: string; body?: Record<string, unknown>; headers?: Record<string, string> };

/** Run Pingwa.execute with the given node parameters and capture the one request it makes. */
async function run(
  params: Record<string, unknown>,
  opts: { continueOnFail?: boolean; response?: { statusCode: number; body: unknown } } = {},
) {
  const sent: Sent[] = [];
  const ctx = {
    getInputData: () => [{ json: {} }],
    getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
      name in params ? params[name] : fallback,
    getNode: () => ({ name: 'Pingwa' }),
    continueOnFail: () => opts.continueOnFail ?? false,
    getCredentials: async () => ({ baseUrl: 'https://pingwa.dev' }),
    helpers: {
      httpRequestWithAuthentication: async (_cred: string, o: Sent) => {
        sent.push({ method: o.method, url: o.url, body: o.body, headers: o.headers });
        return opts.response ?? { statusCode: 200, body: { id: 'm1' } };
      },
    },
  };
  const out = await new Pingwa().execute.call(ctx as never);
  return { sent, out };
}

const notify = { operation: 'notify', text: 'hi' };
const ask = { operation: 'ask', askText: 'ok?' };

describe('Notify request body', () => {
  it('default sends exactly what 0.1.6 sent: no `to`, no `ack`', async () => {
    const { sent } = await run(notify);
    expect(sent[0].body).toEqual({ text: 'hi' });
  });

  it('explicit Me and ack=false still omit both fields', async () => {
    const { sent } = await run({ ...notify, to: 'me', ack: false });
    expect(sent[0].body).toEqual({ text: 'hi' });
  });

  it('Team sends to: "team"', async () => {
    const { sent } = await run({ ...notify, to: 'team' });
    expect(sent[0].body).toEqual({ text: 'hi', to: 'team' });
  });

  it('Specific Members sends a trimmed list and drops empty entries', async () => {
    const { sent } = await run({ ...notify, to: 'members', toMembers: ' ana, mem_2 ,,bob ' });
    expect(sent[0].body).toEqual({ text: 'hi', to: ['ana', 'mem_2', 'bob'] });
  });

  it('Specific Members with no entries fails instead of silently sending to me', async () => {
    await expect(run({ ...notify, to: 'members', toMembers: ' , ' })).rejects.toThrow(/member/i);
  });

  it('ack=true sends ack: true', async () => {
    const { sent } = await run({ ...notify, ack: true });
    expect(sent[0].body).toEqual({ text: 'hi', ack: true });
  });

  it('Team plus ack plus image keeps every field', async () => {
    const { sent } = await run({ ...notify, to: 'team', ack: true, imageUrl: 'https://x/y.png' });
    expect(sent[0].body).toEqual({ text: 'hi', image_url: 'https://x/y.png', to: 'team', ack: true });
  });
});

describe('Ask request body', () => {
  it('default sends exactly what 0.1.6 sent: no `to`, never `ack`', async () => {
    const { sent } = await run(ask);
    expect(sent[0].body).toEqual({ text: 'ok?' });
  });

  it('Team sends to: "team"', async () => {
    const { sent } = await run({ ...ask, to: 'team' });
    expect(sent[0].body).toEqual({ text: 'ok?', to: 'team' });
  });

  it('Specific Members sends a list', async () => {
    const { sent } = await run({ ...ask, to: 'members', toMembers: 'ana,bob' });
    expect(sent[0].body).toEqual({ text: 'ok?', to: ['ana', 'bob'] });
  });

  it('does not send ack even if the parameter leaks in (server ask has no ack)', async () => {
    const { sent } = await run({ ...ask, ack: true });
    expect(sent[0].body).toEqual({ text: 'ok?' });
  });
});

describe('Ask timeout', () => {
  const timedOut = { ...ask, timeout: 5, onTimeout: 'continue' };

  it('reads message_id from the 408 body `detail`', async () => {
    const { out } = await run(timedOut, {
      response: { statusCode: 408, body: { detail: { error: 'ask_timeout', message_id: 'msg_42' } } },
    });
    expect(out[0][0].json).toEqual({ answered: false, timedOut: true, message_id: 'msg_42' });
  });

  it('still accepts a top-level message_id on the 408 body', async () => {
    const { out } = await run(timedOut, { response: { statusCode: 408, body: { message_id: 'msg_43' } } });
    expect(out[0][0].json).toEqual({ answered: false, timedOut: true, message_id: 'msg_43' });
  });

  it('reads the timeout_ok shape: 200 {message_id, answered: false}', async () => {
    const { out } = await run(timedOut, {
      response: { statusCode: 200, body: { message_id: 'msg_44', answered: false } },
    });
    expect(out[0][0].json).toEqual({ answered: false, timedOut: true, message_id: 'msg_44' });
  });

  it('timeout_ok shape honours On Timeout = error', async () => {
    await expect(
      run(
        { ...ask, timeout: 5, onTimeout: 'error' },
        { response: { statusCode: 200, body: { message_id: 'msg_45', answered: false } } },
      ),
    ).rejects.toThrow(/No reply before timeout/);
  });

  it('does not send timeout_ok (older servers)', async () => {
    const { sent } = await run(timedOut);
    expect(sent[0].body).toEqual({ text: 'ok?', timeout: 5 });
  });
});

describe('node description', () => {
  const props = new Pingwa().description.properties;
  const byName = (n: string) => props.filter((p) => p.name === n);

  it('`to` defaults to Me and is shown for Notify and Ask only', () => {
    const [to] = byName('to');
    expect(to.default).toBe('me');
    expect(to.displayOptions?.show?.operation).toEqual(['notify', 'ask']);
    expect((to.options as { value: string }[]).map((o) => o.value)).toEqual(['me', 'team', 'members']);
  });

  it('`ack` defaults to false and is shown for Notify only', () => {
    const [ack] = byName('ack');
    expect(ack.default).toBe(false);
    expect(ack.displayOptions?.show?.operation).toEqual(['notify']);
  });

  it('member list is shown only when `to` is Specific Members', () => {
    const [m] = byName('toMembers');
    expect(m.displayOptions?.show?.to).toEqual(['members']);
  });
});
