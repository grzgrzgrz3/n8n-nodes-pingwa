import { inboxToItems, filterReplies } from './GenericFunctions';

const rows = [
  { id: 'm1', body: 'yes', button_id: null, reply_to_message_id: 'q1', wa_message_id: 'wamid.1', created_at: '2026-07-20T10:00:00Z' },
  { id: 'm2', body: 'hello', button_id: null, reply_to_message_id: null, wa_message_id: 'wamid.2', created_at: '2026-07-20T10:01:00Z' },
];

describe('inboxToItems', () => {
  it('maps rows to the webhook-shaped payload with event=inbound_message', () => {
    const out = inboxToItems(rows);
    expect(out).toEqual([
      { event: 'inbound_message', message_id: 'm1', body: 'yes', button_id: null, reply_to_message_id: 'q1', wa_message_id: 'wamid.1', created_at: '2026-07-20T10:00:00Z' },
      { event: 'inbound_message', message_id: 'm2', body: 'hello', button_id: null, reply_to_message_id: null, wa_message_id: 'wamid.2', created_at: '2026-07-20T10:01:00Z' },
    ]);
  });
  it('returns [] for empty input', () => {
    expect(inboxToItems([])).toEqual([]);
  });
});

describe('filterReplies', () => {
  it('keeps only rows that reply to an outbound message', () => {
    const out = filterReplies(inboxToItems(rows));
    expect(out.map((r) => r.message_id)).toEqual(['m1']);
  });
});
