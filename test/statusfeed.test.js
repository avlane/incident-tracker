import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAtomFeed, xmlEscape } from '../server/statusfeed.js';

test('xmlEscape handles markup, quotes and illegal control characters', () => {
  assert.equal(xmlEscape(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;');
  assert.equal(xmlEscape('a\u0000b\u000bc\td\n'), 'abc\td\n');
});

const page = {
  generatedAt: '2026-01-14T12:00:00.000Z',
  active: [
    {
      id: 'INC-0002',
      title: 'Search <slow>',
      updates: [
        { at: '2026-01-14T11:30:00.000Z', status: 'identified', message: 'Index node & disk' },
        { at: '2026-01-14T11:00:00.000Z', status: 'investigating', message: 'Looking' },
      ],
    },
  ],
  recent: [
    {
      id: 'INC-0001',
      title: 'Login down',
      updates: [
        { at: '2026-01-13T09:30:00.000Z', status: 'resolved', message: 'Fixed' },
        { at: '2026-01-13T09:00:00.000Z', status: 'investigating', message: 'Investigating' },
      ],
    },
  ],
};

test('entries are one per public update, newest first, with stable ids', () => {
  const xml = buildAtomFeed(page, { baseUrl: 'https://status.example.com/' });
  const ids = [...xml.matchAll(/<entry>\s*<id>([^<]+)<\/id>/g)].map((m) => m[1]);
  assert.deepEqual(ids, [
    'tag:incident-tracker,2023:INC-0002/2',
    'tag:incident-tracker,2023:INC-0002/1',
    'tag:incident-tracker,2023:INC-0001/2',
    'tag:incident-tracker,2023:INC-0001/1',
  ]);
  assert.match(xml, /<updated>2026-01-14T11:30:00.000Z<\/updated>\n  <link href="https:\/\/status.example.com\/#\/status"\/>/);
  assert.match(xml, /<title>\[Identified\] Search &lt;slow&gt;<\/title>/);
  assert.match(xml, /<content type="text">Index node &amp; disk<\/content>/);
  assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
});

test('an empty page still produces a valid feed', () => {
  const xml = buildAtomFeed({ generatedAt: '2026-01-14T12:00:00.000Z', active: [], recent: [] }, { baseUrl: 'http://localhost:3000' });
  assert.match(xml, /<updated>2026-01-14T12:00:00.000Z<\/updated>/);
  assert.ok(!xml.includes('<entry>'));
  assert.ok(xml.endsWith('</feed>\n'));
});
