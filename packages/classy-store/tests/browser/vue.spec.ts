import {expect, type Page} from '@playwright/test';
import {test} from './browser.test';
import type {} from './vue/client';

async function expectListenerCounts(page: Page, syncListeners: number) {
  const listeners = await page.evaluate(
    () => window.vueProbe.getState().listeners,
  );
  // Packed consumers retain public cleanup checks; only source tests inspect internals.
  if (listeners !== null)
    expect(listeners).toEqual({syncListeners, batchedListeners: 1});
}

test.beforeEach(async ({page}) => {
  await page.goto('/vue');
  await expect(page.getByLabel('Text', {exact: true})).toHaveValue('abcdef');
});

test('Vue inputs preserve the caret and support writable computed models', async ({
  page,
}) => {
  const input = page.getByLabel('Text', {exact: true});
  await input.focus();
  await input.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(2, 2),
  );
  await input.pressSequentially('XY');
  await expect(input).toHaveValue('abXYcdef');
  expect(
    await input.evaluate((element: HTMLInputElement) => element.selectionStart),
  ).toBe(4);
  await expect(page.getByTestId('uppercase')).toHaveText('ABXYCDEF');
  await expect(page.getByLabel('Text model')).toHaveValue('abXYcdef');
  await input.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(2, 4),
  );
  await input.pressSequentially('Z');
  await expect(input).toHaveValue('abZcdef');
  expect(
    await input.evaluate((element: HTMLInputElement) => element.selectionStart),
  ).toBe(3);
  await input.press('Backspace');
  await expect(input).toHaveValue('abcdef');
  await page.getByLabel('Text model').fill('model edit');
  await expect(input).toHaveValue('model edit');
  await expect(page.getByTestId('uppercase')).toHaveText('MODEL EDIT');
  await page.getByLabel('Enabled').check();
  await expect(page.getByTestId('enabled')).toHaveText('true');
  await page.getByLabel('Enabled').uncheck();
  await expect(page.getByTestId('enabled')).toHaveText('false');
  await page.evaluate(() => window.vueProbe.setText('external'));
  await expect(input).toHaveValue('external');
  await expect(page.getByLabel('Text model')).toHaveValue('external');
});

test('Vue updates refs immediately and the DOM after one nextTick while core subscriptions batch', async ({
  page,
}) => {
  await expect(page.getByTestId('summary')).toHaveText('abcdef:2:ABCDEF');
  await page.getByRole('button', {name: 'Update together'}).click();
  await expect(page.getByTestId('summary')).toHaveText('updated:6:UPDATED');
  const state = await page.evaluate(() => window.vueProbe.getState());
  expect(state.summaryAfterNextTick).toBe('updated:6:UPDATED');
  expect(state.snapshotDuringEvent).toBe('updated:6:UPDATED');
  expect(state.coreDuringEvent).toBe(0);
  expect(state.coreNotifications).toBe(1);
  expect(state.commits).toEqual(['abcdef:2:ABCDEF', 'updated:6:UPDATED']);
});

test('Vue keyed lists handle insertion, nested edits, removal, and replacement', async ({
  page,
}) => {
  const items = page.getByRole('listitem');
  await expect(items).toHaveText(['One', 'Two']);
  await page.getByRole('button', {name: 'Add item'}).click();
  await expect(items).toHaveText(['One', 'Two', 'Three']);
  await expect(page.getByTestId('item-count')).toHaveText('3');
  await page.getByRole('button', {name: 'Rename first'}).click();
  await expect(items).toHaveText(['Renamed', 'Two', 'Three']);
  await page.getByRole('button', {name: 'Remove first'}).click();
  await expect(items).toHaveText(['Two', 'Three']);
  await expect(page.getByTestId('item-count')).toHaveText('2');
  await page.getByRole('button', {name: 'Replace items'}).click();
  await expect(items).toHaveText(['Four']);
  await expect(page.getByTestId('item-count')).toHaveText('1');
});

test('Vue unmount cancels pending renders and releases subscriptions across remounts', async ({
  page,
}) => {
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await expectListenerCounts(page, 1);
    const commits = await page.evaluate(() => {
      const count = window.vueProbe.getState().commits.length;
      window.vueProbe.setText('pending');
      window.vueProbe.unmount();
      return count;
    });
    await expect(page.getByLabel('Text', {exact: true})).toHaveCount(0);
    await expectListenerCounts(page, 0);
    await page.evaluate(
      (value) => window.vueProbe.setText(value),
      `unmounted-${cycle}`,
    );
    expect(
      await page.evaluate(() => window.vueProbe.getState().commits.length),
    ).toBe(commits);
    await page.evaluate(() => window.vueProbe.mount());
    await expect(page.getByLabel('Text', {exact: true})).toHaveValue(
      `unmounted-${cycle}`,
    );
    await expect(page.getByTestId('uppercase')).toHaveText(
      `UNMOUNTED-${cycle}`,
    );
  }
});
