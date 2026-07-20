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
