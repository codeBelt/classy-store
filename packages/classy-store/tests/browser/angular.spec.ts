import {expect, type Page} from '@playwright/test';
import type {} from './angular/client';
import {test as base} from './browser.test';

const test = base.extend<{angularWarnings: undefined}>({
  angularWarnings: [
    async ({page}, use) => {
      const warnings: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'warning') warnings.push(message.text());
      });
      await use(undefined);
      expect(warnings, 'Unexpected Angular warnings').toEqual([]);
    },
    {auto: true},
  ],
});

async function expectListenerCounts(page: Page, syncListeners: number) {
  const listeners = await page.evaluate(
    () => window.angularProbe.getState().listeners,
  );
  // Public packed consumers cannot inspect private core listener sets.
  if (listeners !== null)
    expect(listeners).toEqual({syncListeners, batchedListeners: 1});
}

test.beforeEach(async ({page}) => {
  await page.goto('/angular/');
  await expect(page.getByLabel('Text', {exact: true})).toHaveValue('abcdef');
  await page.evaluate(() => window.angularProbe.stable());
});

test('Angular signals are current during events, while effects, rendering, and core callbacks coalesce', async ({
  page,
}) => {
  expect(await page.evaluate(() => 'Zone' in window)).toBe(false);
  await expect(page.getByTestId('summary')).toHaveText('abcdef:2:ABCDEF');
  await page.getByRole('button', {name: 'Update together'}).click();
  await page.evaluate(() => window.angularProbe.stable());
  await expect(page.getByTestId('summary')).toHaveText('updated:6:UPDATED');
  expect(
    await page.evaluate(() => window.angularProbe.getState()),
  ).toMatchObject({
    snapshotDuringEvent: 'updated:6:UPDATED',
    coreDuringEvent: 0,
    coreNotifications: 1,
    effects: ['abcdef:2:ABCDEF', 'updated:6:UPDATED'],
  });
});

test('Angular text and checkbox inputs preserve editing and reflect external writes', async ({
  page,
}) => {
  const input = page.getByLabel('Text', {exact: true});
  await input.focus();
  await input.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(2, 2),
  );
  await input.pressSequentially('XY');
  await page.evaluate(() => window.angularProbe.stable());
  await expect(input).toHaveValue('abXYcdef');
  expect(
    await input.evaluate((element: HTMLInputElement) => element.selectionStart),
  ).toBe(4);
  await expect(page.getByTestId('uppercase')).toHaveText('ABXYCDEF');
  await input.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(2, 4),
  );
  await input.pressSequentially('Z');
  await page.evaluate(() => window.angularProbe.stable());
  await expect(input).toHaveValue('abZcdef');
  expect(
    await input.evaluate((element: HTMLInputElement) => element.selectionStart),
  ).toBe(3);
  await input.press('Backspace');
  await page.evaluate(() => window.angularProbe.stable());
  await expect(input).toHaveValue('abcdef');
  expect(
    await input.evaluate((element: HTMLInputElement) => element.selectionStart),
  ).toBe(2);
  await page.getByLabel('Enabled').check();
  await expect(page.getByTestId('enabled')).toHaveText('true');
  await page.getByLabel('Enabled').uncheck();
  await expect(page.getByTestId('enabled')).toHaveText('false');
  await page.evaluate(() => window.angularProbe.setText('external'));
  await expect(input).toHaveValue('external');
  await expect(page.getByTestId('uppercase')).toHaveText('EXTERNAL');
});

test('Angular keyed lists preserve retained rows through edits, reorder, removal, and replacement', async ({
  page,
}) => {
  const rows = page.getByRole('listitem');
  await expect(rows).toHaveText(['One', 'Two']);
  const retained = await page.locator('li[data-id="2"]').elementHandle();
  if (!retained) throw new Error('Missing retained row');
  await page.evaluate(() => window.angularProbe.addItem());
  await expect(rows).toHaveText(['One', 'Two', 'Three']);
  await expect(page.getByTestId('item-count')).toHaveText('3');
  await page.evaluate(() => window.angularProbe.renameFirst());
  await expect(rows).toHaveText(['Renamed', 'Two', 'Three']);
  await page.evaluate(() => window.angularProbe.reverseItems());
  await expect(rows).toHaveText(['Three', 'Two', 'Renamed']);
  expect(
    await retained.evaluate(
      (element) => element === document.querySelector('li[data-id="2"]'),
    ),
  ).toBe(true);
  await page.evaluate(() => window.angularProbe.removeFirst());
  await expect(rows).toHaveText(['Two', 'Renamed']);
  await page.evaluate(() => window.angularProbe.replaceItems());
  await expect(rows).toHaveText(['Two replaced', 'Four']);
  await expect(page.getByTestId('item-count')).toHaveText('2');
  expect(
    await retained.evaluate(
      (element) => element === document.querySelector('li[data-id="2"]'),
    ),
  ).toBe(true);
  await retained.dispose();
});

test('Angular zoneless OnPush consumers update from a timer without manual change detection', async ({
  page,
}) => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          window.angularProbe.setText('timer update');
          resolve();
        }, 0),
      ),
  );
  await page.evaluate(() => window.angularProbe.stable());
  await expect(page.getByTestId('summary')).toHaveText(
    'timer update:2:TIMER UPDATE',
  );
});

test('Angular component scopes clean up independently beneath a live parent', async ({
  page,
}) => {
  await page.evaluate(() => window.angularProbe.setConsumers([1, 2]));
  await expect(page.getByLabel('Text', {exact: true})).toHaveCount(2);
  await expectListenerCounts(page, 2);
  await page.evaluate(() => window.angularProbe.setConsumers([2]));
  await expect(page.getByLabel('Text', {exact: true})).toHaveCount(1);
  await expectListenerCounts(page, 1);
  const before = await page.evaluate(
    () => window.angularProbe.getState().effects.length,
  );
  await page.evaluate(() => window.angularProbe.setText('remaining'));
  await expect(page.getByTestId('summary')).toHaveText('remaining:2:REMAINING');
  await page.evaluate(() => window.angularProbe.stable());
  expect(
    await page.evaluate(() => window.angularProbe.getState().effects.length),
  ).toBe(before + 1);
  await page.evaluate(() => window.angularProbe.setConsumers([]));
  await expect(page.getByLabel('Text', {exact: true})).toHaveCount(0);
  await expectListenerCounts(page, 0);
  const stopped = await page.evaluate(
    () => window.angularProbe.getState().effects.length,
  );
  await page.evaluate(() => window.angularProbe.setText('no consumers'));
  await page.evaluate(() => window.angularProbe.stable());
  expect(
    await page.evaluate(() => window.angularProbe.getState().effects.length),
  ).toBe(stopped);
});

test('Angular repeated teardown cancels pending effects and remounts with current state', async ({
  page,
}) => {
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await expectListenerCounts(page, 1);
    const before = await page.evaluate(() => {
      const count = window.angularProbe.getState().effects.length;
      window.angularProbe.setText('pending');
      window.angularProbe.unmount();
      return count;
    });
    await expectListenerCounts(page, 0);
    await page.evaluate(
      (text) => window.angularProbe.setText(text),
      `unmounted-${cycle}`,
    );
    expect(
      await page.evaluate(() => window.angularProbe.getState().effects.length),
    ).toBe(before);
    await page.evaluate(() => window.angularProbe.mount());
    await expect(page.getByLabel('Text', {exact: true})).toHaveValue(
      `unmounted-${cycle}`,
    );
  }
});
