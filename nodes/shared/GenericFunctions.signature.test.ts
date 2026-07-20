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
