import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readJson } from '../server/http.js';

const body = (text) => Readable.from([Buffer.from(text)]);

test('readJson parses an object', async () => {
  assert.deepEqual(await readJson(body('{"a":1}')), { a: 1 });
});

test('readJson treats an empty body as an empty object', async () => {
  assert.deepEqual(await readJson(Readable.from([])), {});
});

test('readJson reassembles multi-chunk bodies', async () => {
  const req = Readable.from([Buffer.from('{"title":"a'), Buffer.from('bc"}')]);
  assert.deepEqual(await readJson(req), { title: 'abc' });
});

test('readJson rejects bad JSON with a 400', async () => {
  await assert.rejects(readJson(body('{nope')), { status: 400 });
});

test('readJson enforces the size limit with a 413', async () => {
  await assert.rejects(readJson(body('{"a":"' + 'x'.repeat(50) + '"}'), { limit: 20 }), { status: 413 });
});
