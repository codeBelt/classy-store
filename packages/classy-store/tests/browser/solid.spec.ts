import {expect} from '@playwright/test';
import {test as base} from './browser.test';

const test = base.extend<{solidWarnings: undefined}>({
  solidWarnings: [
    async ({page}, use) => {
      const warnings: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'warning') warnings.push(message.text());
      });
      await use(undefined);
      expect(warnings, 'Solid development warnings').toEqual([]);
    },
    {auto: true},
  ],
});

test.beforeEach(async ({page}) => {
  await page.goto('/solid');
  await expect(page.getByLabel('Text', {exact: true})).toHaveValue('abcdef');
});

test('Solid 2 inputs preserve caret positions and receive external changes', async ({
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
  await page.getByLabel('Enabled').check();
  await expect(page.getByTestId('enabled')).toHaveText('true');
  await page.getByLabel('Enabled').uncheck();
  await expect(page.getByTestId('enabled')).toHaveText('false');
  await page.evaluate(() => window.solidProbe.setText('external'));
  await expect(input).toHaveValue('external');
  await expect(page.getByTestId('uppercase')).toHaveText('EXTERNAL');
});

test('Solid 2 matches native scheduling and coalesces multi-property effects', async ({
  page,
}) => {
  await page
    .getByRole('button', {name: 'Update together', exact: true})
    .click();
  await expect(page.getByTestId('summary')).toHaveText('updated:6:UPDATED');
  const result = await page.evaluate(() => window.solidProbe.getState());
  expect(result.countDuringEvent).toBe(result.nativeDuringEvent);
  expect(result.summaryAfterMicrotask).toBe('updated:6:UPDATED');
  expect(result.coreDuringEvent).toBe(0);
  expect(result.coreNotifications).toBe(1);
  expect(result.commits).toEqual(['abcdef:2:ABCDEF', 'updated:6:UPDATED']);
  expect(result.nativeCommits).toEqual([1, 3]);
});

test('Solid 2 flush applies snapshot, computed, and DOM updates without flushing core subscribers', async ({
  page,
}) => {
  await page.getByRole('button', {name: 'Flush update', exact: true}).click();
  const result = await page.evaluate(() => window.solidProbe.getState());
  expect(result.summaryAfterFlush).toBe('updated:6:UPDATED');
  expect(result.computedAfterFlush).toBe('updated:6:UPDATED');
  expect(result.coreAfterFlush).toBe(0);
  expect(result.coreDuringEvent).toBe(0);
  expect(result.coreNotifications).toBe(1);
  expect(result.commits).toEqual(['abcdef:2:ABCDEF', 'updated:6:UPDATED']);
});

test('Solid 2 keyed lists retain rows across edits, reorder, and replacement', async ({
  page,
}) => {
  const items = page.getByRole('listitem');
  const second = await page.getByTestId('item-2').elementHandle();
  if (!second) throw new Error('Missing second item');
  await expect(items).toHaveText(['One', 'Two']);
  await page.getByRole('button', {name: 'Add item'}).click();
  await expect(items).toHaveText(['One', 'Two', 'Three']);
  await page.getByRole('button', {name: 'Rename first'}).click();
  await expect(items).toHaveText(['Renamed', 'Two', 'Three']);
  await page.getByRole('button', {name: 'Reverse items'}).click();
  await expect(items).toHaveText(['Three', 'Two', 'Renamed']);
  await page.getByRole('button', {name: 'Remove first'}).click();
  await expect(items).toHaveText(['Two', 'Renamed']);
  await page.getByRole('button', {name: 'Replace items'}).click();
  await expect(items).toHaveText(['Two replaced', 'Four']);
  await expect(page.getByTestId('item-count')).toHaveText('2');
  expect(
    await second.evaluate(
      (element) => element === document.querySelector('[data-testid="item-2"]'),
    ),
  ).toBe(true);
  await second.dispose();
});

test('Solid 2 unmount releases subscriptions and cancels pending effects across remounts', async ({
  page,
}) => {
  for (let cycle = 0; cycle < 3; cycle += 1) {
    expect(
      await page.evaluate(() => window.solidProbe.getState()),
    ).toMatchObject({syncListeners: 1, batchedListeners: 1});
    const commits = await page.evaluate(() => {
      const count = window.solidProbe.getState().commits.length;
      window.solidProbe.setText('pending');
      window.solidProbe.unmount();
      return count;
    });
    await expect(page.getByLabel('Text', {exact: true})).toHaveCount(0);
    expect(
      await page.evaluate(() => window.solidProbe.getState()),
    ).toMatchObject({syncListeners: 0, batchedListeners: 1});
    await page.evaluate(
      (value) => window.solidProbe.setText(value),
      `unmounted-${cycle}`,
    );
    expect(
      await page.evaluate(() => window.solidProbe.getState().commits.length),
    ).toBe(commits);
    await page.evaluate(() => window.solidProbe.mount());
    await expect(page.getByLabel('Text', {exact: true})).toHaveValue(
      `unmounted-${cycle}`,
    );
    await expect(page.getByTestId('uppercase')).toHaveText(
      `UNMOUNTED-${cycle}`,
    );
  }
});

test('Solid 2 validates owners and cleans up nested and independent consumers', async ({
  page,
}) => {
  const result = await page.evaluate(() => window.solidProbe.lifecycle());
  expect(result.errors).toHaveLength(2);
  expect(
    result.errors.every((message) => message.includes('active Solid owner')),
  ).toBe(true);
  expect(result.listenersAfterRejection).toBe(0);
  expect(result.firstValues).toEqual([0, 1]);
  expect(result.secondValues).toEqual([0, 1, 2]);
  expect(result.victimCount).toBe(2);
  expect(result.remainingListeners).toBe(0);
});
