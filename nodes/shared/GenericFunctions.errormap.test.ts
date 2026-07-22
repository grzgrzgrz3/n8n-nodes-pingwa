import { mapPingwaError } from './GenericFunctions';

describe('mapPingwaError', () => {
  it('splits message (what happened) and action (how to fix)', () => {
    const out = mapPingwaError({ error: 'quota_exceeded', message: 'Out of quota.', action: 'Upgrade to Pro.' });
    expect(out).toEqual({ message: 'Out of quota.', description: 'Upgrade to Pro.' });
  });

  it('falls back to the error code when no message, no description without action', () => {
    expect(mapPingwaError({ error: 'boom' })).toEqual({ message: 'boom' });
  });

  it('returns a generic message for a non-envelope body', () => {
    expect(mapPingwaError('nope')).toEqual({ message: 'Pingwa did not accept the request' });
    expect(mapPingwaError(undefined)).toEqual({ message: 'Pingwa did not accept the request' });
  });
});
