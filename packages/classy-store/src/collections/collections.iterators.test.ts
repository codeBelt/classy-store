import {describe, expect, test} from 'bun:test';
import {reactiveSet} from './index';

describe('reactiveSet() — iterators', () => {
  test('entries() lists the items present when it was called, whatever changes afterwards', () => {
    const tags = reactiveSet(['a', 'b', 'c']);
    const entries = tags.entries();

    tags.add('d');
    tags.delete('a');

    expect([...entries]).toEqual([
      ['a', 'a'],
      ['b', 'b'],
      ['c', 'c'],
    ]);
  });
});
