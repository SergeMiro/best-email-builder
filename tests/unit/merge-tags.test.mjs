/** Merge tags in an element's words: found in order, taken out with one space beside them. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, removalSpan, withoutTagInText } from '../../src/engine/mergeTags.js';

test('the tags of a text, in order, with spaces and a default inside the braces', () => {
  const text = 'Hi {{contact.firstname}}, {{ unsubscribe }} {{name | default: "there"}} {{1bad}} {{}}';
  assert.deepEqual(
    findTags(text).map(({ start, end }) => text.slice(start, end)),
    ['{{contact.firstname}}', '{{ unsubscribe }}', '{{name | default: "there"}}']
  );
});

test('taken out with the space before it, before punctuation or at the end', () => {
  assert.equal(withoutTagInText('Hello {{name}}, welcome', 0), 'Hello, welcome');
  assert.equal(withoutTagInText('Hello {{name}}', 0), 'Hello');
  assert.equal(withoutTagInText('Hello {{first}} {{last}}!', 1), 'Hello {{first}}!');
  assert.equal(withoutTagInText('Hello {{first}} {{last}}!', 0), 'Hello {{last}}!');
});

test('at the start, with the space after it; glued to a word, alone', () => {
  assert.equal(withoutTagInText('{{name}} Smith', 0), 'Smith');
  assert.equal(withoutTagInText('Ref-{{id}}-2', 0), 'Ref--2');
  assert.equal(withoutTagInText('{{name}}', 0), '');
  assert.deepEqual(removalSpan('a\n{{x}} b', 2, 7), { start: 2, end: 8 });
});

test('an index past the tags changes nothing', () => {
  assert.equal(withoutTagInText('Hello {{name}}', 1), 'Hello {{name}}');
  assert.equal(withoutTagInText('No tag here', 0), 'No tag here');
});
