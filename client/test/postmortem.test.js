import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankActionItem,
  emptyPostmortemForm,
  linesToList,
  listToLines,
  toPostmortemPayload,
  validatePostmortemForm,
} from '../src/lib/postmortem.js';

test('linesToList strips bullets, blanks and whitespace', () => {
  assert.deepEqual(linesToList('- first\n  * second  \n\n third\r\n-\n'), ['first', 'second', 'third', '-']);
  assert.deepEqual(linesToList(''), []);
  assert.equal(listToLines(['a', 'b']), 'a\nb');
  assert.equal(listToLines(undefined), '');
});

test('the form starts from the stored postmortem, or empty', () => {
  const blank = emptyPostmortemForm({ postmortem: null });
  assert.equal(blank.rootCause, '');
  assert.deepEqual(blank.actionItems, []);
  const filled = emptyPostmortemForm({
    postmortem: { rootCause: 'x', wentWell: ['a', 'b'], actionItems: [{ action: 'fix', owner: 'Sam' }] },
  });
  assert.equal(filled.wentWell, 'a\nb');
  assert.deepEqual(filled.actionItems, [{ action: 'fix', owner: 'Sam', due: '' }]);
});

test('blank action rows are dropped and the rest trimmed', () => {
  const form = {
    ...emptyPostmortemForm({}),
    rootCause: ' pool exhausted ',
    wentWell: '- fast rollback',
    actionItems: [
      { action: ' add alert ', owner: ' Priya ', due: '2025-05-30' },
      blankActionItem(),
      { action: 'no owner', owner: '', due: '' },
    ],
  };
  assert.deepEqual(toPostmortemPayload(form), {
    rootCause: 'pool exhausted',
    detection: '',
    wentWell: ['fast rollback'],
    wentPoorly: [],
    actionItems: [{ action: 'add alert', owner: 'Priya', due: '2025-05-30' }, { action: 'no owner' }],
  });
});

test('validation flags half-filled and badly dated rows only', () => {
  const form = {
    ...emptyPostmortemForm({}),
    actionItems: [blankActionItem(), { action: '', owner: 'Sam', due: '' }, { action: 'ok', owner: '', due: '30/05/2025' }, { action: 'fine', owner: '', due: '2025-05-30' }],
  };
  assert.deepEqual(Object.keys(validatePostmortemForm(form)), ['actionItems.1', 'actionItems.2']);
  assert.deepEqual(validatePostmortemForm(emptyPostmortemForm({})), {});
});
