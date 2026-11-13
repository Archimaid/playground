import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { convertNotation, detectNotation } from '../src/notation.ts';

const header =
  'archimate-beta\n  element applicationComponent a "A"\n  element dataObject d "D"\n  element node n "N"\n';

test('long-form relationships become shorthand, keeping labels, modes and comments', () => {
  const source =
    header +
    '  relationship access reads a -> d access read\n' +
    '  relationship access touches a -> d\n' +
    '  relationship association links a -> n directed label "Uses" %% why\n';
  const result = convertNotation(source, 'shorthand');
  assert.deepEqual(result, {
    kind: 'converted',
    converted: 3,
    kept: 0,
    source: header + '  a <.. d\n' + '  a .. d\n' + '  a --/ n : "Uses" %% why\n',
  });
});

test('shorthand becomes long form with readable, unique IDs', () => {
  const source = header + '  a ..> d\n  a --> n : "Hosts"\n  a --> n : "Again"\n';
  const result = convertNotation(source, 'long');
  assert.equal(result.kind, 'converted');
  assert.equal(
    result.kind === 'converted' && result.source,
    header +
      '  relationship access a_access_d a -> d access write\n' +
      '  relationship serving a_serving_n a -> n label "Hosts"\n' +
      '  relationship serving a_serving_n_2 a -> n label "Again"\n',
  );
});

test('a relationship that another line names by ID stays in long form', () => {
  const source =
    'archimate-beta\n  element applicationComponent suite "Suite"\n  element applicationComponent part "Part"\n' +
    '  relationship composition includes suite -> part\n  nest part in suite via includes\n';
  assert.deepEqual(convertNotation(source, 'shorthand'), { kind: 'unchanged', kept: 1 });
});

test('an invalid source is not rewritten', () => {
  assert.deepEqual(convertNotation('archimate-beta\n  a --> missing\n', 'shorthand'), { kind: 'invalid' });
});

test('every packaged example converts both ways without changing the diagram', async () => {
  const directory = new URL('../node_modules/archimaid/examples/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.mmd'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = await readFile(new URL(file, directory), 'utf8');
    const shorthand = convertNotation(source, 'shorthand');
    assert.notEqual(shorthand.kind, 'failed', file);
    assert.notEqual(shorthand.kind, 'invalid', file);
    const back = convertNotation(shorthand.kind === 'converted' ? shorthand.source : source, 'long');
    assert.notEqual(back.kind, 'failed', file);
  }
});

test('the detected notation ignores long-form relationships that must stay long', () => {
  const nested =
    'archimate-beta\n  element applicationComponent suite "Suite"\n  element applicationComponent part "Part"\n' +
    '  relationship composition includes suite -> part\n  nest part in suite via includes\n';
  assert.equal(detectNotation(header + '  a ..> d\n'), 'shorthand');
  assert.equal(detectNotation(header + '  relationship access w a -> d access write\n'), 'long');
  assert.equal(detectNotation(header + '  a ..> d\n  relationship access w a -> d access write\n'), 'mixed');
  assert.equal(detectNotation(nested + '  part --> suite\n'), 'shorthand');
  assert.equal(detectNotation(header), 'none');
});
