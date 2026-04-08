import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPayload, slackEscape } from '../server/webhookformat.js';

const event = (type, incident) => ({ id: 'evt_1', type, createdAt: '2026-04-08T10:00:00.000Z', data: { incident } });

const incident = {
  id: 'INC-0007',
  title: 'Search <slow> & flaky',
  status: 'identified',
  affected: [{ service: 'Search', component: 'Indexer', impact: 'degraded' }, { service: 'API', component: null, impact: 'degraded' }],
  updates: [
    { at: '2026-04-08T09:30:00.000Z', status: 'identified', message: 'Disk full on <node-3>' },
    { at: '2026-04-08T09:00:00.000Z', status: 'investigating', message: 'Looking' },
  ],
};

test('json is the event untouched', () => {
  const e = event('incident.updated', incident);
  assert.equal(formatPayload('json', e), e);
  assert.equal(formatPayload(undefined, e), e);
});

test('slack messages carry a headline, status, affected services and the newest update', () => {
  const msg = formatPayload('slack', event('incident.updated', incident));
  assert.equal(msg.text, 'Incident update: INC-0007 Search <slow> & flaky (Identified)');
  const body = msg.blocks[0].text;
  assert.equal(body.type, 'mrkdwn');
  assert.equal(
    body.text,
    ['*Incident update: INC-0007 Search &lt;slow&gt; &amp; flaky*', 'Status: Identified', 'Affected: Search / Indexer, API', 'Disk full on &lt;node-3&gt;'].join('\n'),
  );
});

test('each event type gets its own headline', () => {
  assert.match(formatPayload('slack', event('incident.created', incident)).text, /^New incident:/);
  assert.match(formatPayload('slack', event('incident.resolved', { ...incident, status: 'resolved' })).text, /^Incident resolved:.*\(Resolved\)$/);
});

test('an incident with nothing affected or no updates still formats', () => {
  const bare = { id: 'INC-1', title: 't', status: 'investigating', affected: [], updates: [] };
  assert.equal(formatPayload('slack', event('incident.created', bare)).blocks[0].text.text, '*New incident: INC-1 t*\nStatus: Investigating');
});

test('the ping event is a plain text message', () => {
  const msg = formatPayload('slack', { id: 'e', type: 'webhook.ping', createdAt: 'x', data: { incident: { message: 'Test event from incident-tracker' } } });
  assert.match(msg.text, /test event/);
  assert.equal(msg.blocks, undefined);
});

test('slackEscape handles the three control characters only', () => {
  assert.equal(slackEscape('a & b < c > d "q" *bold*'), 'a &amp; b &lt; c &gt; d "q" *bold*');
});
