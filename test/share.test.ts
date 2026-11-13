import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeShareHash, encodeShareHash } from '../src/share.ts';

test('a share link round-trips the exact source', async () => {
  const sources = [
    'archimate-beta\n  element businessActor customer "Customer"\n',
    'archimate-beta\n  title: Zürich — 東京 ✓\n',
    '',
    'x'.repeat(50_000),
  ];
  for (const source of sources) {
    const hash = await encodeShareHash(source);
    assert.match(hash, /^#code=[A-Za-z0-9_-]*$/u);
    assert.deepEqual(await decodeShareHash(hash), { kind: 'source', source });
  }
});

test('a hash without a shared diagram is ignored', async () => {
  assert.deepEqual(await decodeShareHash(''), { kind: 'none' });
  assert.deepEqual(await decodeShareHash('#examples'), { kind: 'none' });
});

test('a damaged share link is reported as invalid', async () => {
  const hash = await encodeShareHash('archimate-beta\n  element goal g "Grow"\n');
  assert.deepEqual(await decodeShareHash(hash.slice(0, -6)), { kind: 'invalid' });
  assert.deepEqual(await decodeShareHash('#code=not*base64'), { kind: 'invalid' });
  assert.deepEqual(await decodeShareHash('#code=AAAA'), { kind: 'invalid' });
});
