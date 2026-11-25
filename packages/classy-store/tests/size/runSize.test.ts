import {describe, expect, it} from 'bun:test';
import {checkProductionBundle, checkSizes} from './runSize';
import type {Budgets, Sizes} from './size.types';

const sizes: Sizes = {
  '.': {minified: 9000, gzip: 3600, added: 0},
  './react': {minified: 13000, gzip: 5200, added: 1600},
};

const budgets = (overrides: Partial<Budgets> = {}): Budgets => ({
  '.': {budget: 3750, ceiling: 5575},
  './react': {budget: 1700, ceiling: 1750},
  ...overrides,
});

describe('checkSizes', () => {
  it('passes sizes under their budgets, with budgets under their ceilings', () => {
    expect(checkSizes(sizes, budgets())).toEqual([]);
  });

  it('passes a budget equal to its ceiling', () => {
    expect(
      checkSizes(sizes, budgets({'./react': {budget: 1750, ceiling: 1750}})),
    ).toEqual([]);
  });

  it('fails the main entry when its whole size is over its budget', () => {
    expect(
      checkSizes(sizes, budgets({'.': {budget: 3599, ceiling: 5575}})),
    ).toEqual(['. is 3600 bytes gzipped, 1 over its budget of 3599']);
  });

  it('fails another entry when what it adds is over its budget', () => {
    expect(
      checkSizes(sizes, budgets({'./react': {budget: 1599, ceiling: 1750}})),
    ).toEqual([
      './react adds 1600 bytes gzipped to the main entry, 1 over its budget of 1599',
    ]);
  });

  it('fails a budget above its ceiling, even when the size fits the budget', () => {
    expect(
      checkSizes(sizes, budgets({'./react': {budget: 1751, ceiling: 1750}})),
    ).toEqual(['./react has a budget of 1751, 1 above its ceiling of 1750']);
  });

  it('fails an entry with no budget or no ceiling', () => {
    const {'./react': _react, ...withoutReact} = budgets();
    expect(checkSizes(sizes, withoutReact)).toEqual([
      './react has no budget in tests/size/budgets.json',
      './react has no ceiling in tests/size/budgets.json',
    ]);
    expect(
      checkSizes(sizes, {
        ...budgets(),
        '.': {budget: 3750} as Budgets[string],
      }),
    ).toEqual(['. has no ceiling in tests/size/budgets.json']);
  });

  it('fails a budget for an entry point that does not exist', () => {
    expect(
      checkSizes(sizes, budgets({'./gone': {budget: 1, ceiling: 1}})),
    ).toEqual(['budgets.json names ./gone, which is not an entry point']);
  });
});

describe('checkProductionBundle', () => {
  it('passes a production bundle with no development text', () => {
    expect(
      checkProductionBundle('.', 'export const a = 1;', ['lost-write']),
    ).toEqual([]);
  });

  it('fails a production bundle that calls console.warn', () => {
    expect(checkProductionBundle('./vue', 'console.warn("x")', [])).toEqual([
      './vue: its production bundle calls console.warn, which only a development-only report may use',
    ]);
  });

  it('fails a production bundle that holds a development-only code', () => {
    expect(
      checkProductionBundle('.', 'throw "[lost-write]"', ['lost-write']),
    ).toEqual([
      '.: its production bundle holds the development-only code lost-write',
    ]);
  });
});
