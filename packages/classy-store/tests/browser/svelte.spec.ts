import {expect} from '@playwright/test';
import {test} from './browser.test';

test.beforeEach(async ({page}) => {
  await page.goto('/svelte');
  await expect(page.getByLabel('Text', {exact: true})).toHaveValue('abcdef');
});

test('Svelte inputs preserve the caret and update computed values', async ({
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
  await expect(page.getByTestId('text')).toHaveText('abXYcdef');
  await expect(page.getByTestId('uppercase')).toHaveText('ABXYCDEF');

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
  await expect(page.getByTestId('uppercase')).toHaveText('ABCDEF');

  await page.evaluate(() => window.svelteProbe.setText('external'));
  await expect(input).toHaveValue('external');
  await expect(page.getByTestId('uppercase')).toHaveText('EXTERNAL');
});

test('Svelte sees multi-property updates during the event while core subscriptions batch', async ({
  page,
}) => {
  await expect(page.getByTestId('doubled')).toHaveText('2');
  await page.getByRole('button', {name: 'Update together'}).click();
  await expect(page.getByLabel('Text', {exact: true})).toHaveValue('updated');
  await expect(page.getByTestId('uppercase')).toHaveText('UPDATED');
  await expect(page.getByTestId('doubled')).toHaveText('6');
  const state = await page.evaluate(() => window.svelteProbe.getState());
  expect(state.snapshotDuringEvent).toBe('updated:6:UPDATED');
  expect(state.coreDuringEvent).toBe(0);
  expect(state.coreNotifications).toBe(1);
});

test('Svelte keyed lists handle insertions, nested edits, removals, and replacement', async ({
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

test('Svelte automatically unsubscribes on unmount and resubscribes with current state', async ({
  page,
}) => {
  for (let cycle = 0; cycle < 3; cycle += 1) {
    expect(
      await page.evaluate(() => window.svelteProbe.getState()),
    ).toMatchObject({
      activeSubscriptions: 1,
      syncListeners: 1,
    });
    await page.evaluate(() => window.svelteProbe.unmount());
    await expect(page.getByLabel('Text', {exact: true})).toHaveCount(0);
    const unmounted = await page.evaluate(() => window.svelteProbe.getState());
    expect(unmounted).toMatchObject({activeSubscriptions: 0, syncListeners: 0});

    await page.evaluate(
      (value) => window.svelteProbe.setText(value),
      `unmounted-${cycle}`,
    );
    expect(
      await page.evaluate(() => window.svelteProbe.getState().deliveries),
    ).toBe(unmounted.deliveries);
    await page.evaluate(() => window.svelteProbe.mount());
    await expect(page.getByLabel('Text', {exact: true})).toHaveValue(
      `unmounted-${cycle}`,
    );
    await expect(page.getByTestId('uppercase')).toHaveText(
      `UNMOUNTED-${cycle}`,
    );
  }
});
