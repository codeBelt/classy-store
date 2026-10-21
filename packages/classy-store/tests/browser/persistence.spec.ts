import {expect, type Page} from '@playwright/test';
import {test} from './browser.test';

async function expectDraft(page: Page, text: string) {
  await expect(page.getByLabel('Draft', {exact: true})).toHaveValue(text);
  await expect(page.getByTestId('tracked')).toHaveText(text);
  await expect(page.getByTestId('selected')).toHaveText(text);
}

test('two tabs synchronize real inputs without echo writes, restore on reload, and unsubscribe', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await page.goto('/persistence');
  await other.goto('/persistence');
  await expectDraft(page, 'Initial');
  await expectDraft(other, 'Initial');

  await page.getByLabel('Draft', {exact: true}).fill('From first tab');
  await expectDraft(other, 'From first tab');
  expect(await other.evaluate(() => window.persistenceProbe.writes)).toBe(0);
  await other.getByLabel('Draft', {exact: true}).fill('From second tab');
  await expectDraft(page, 'From second tab');
  expect(await page.evaluate(() => window.persistenceProbe.writes)).toBe(1);
  expect(await other.evaluate(() => window.persistenceProbe.writes)).toBe(1);
  expect(
    await other.evaluate(() => window.persistenceProbe.trustedEvents),
  ).toBe(1);

  await page.reload();
  await expectDraft(page, 'From second tab');
  await other.getByRole('button', {name: 'Stop persistence'}).click();
  await expect(other.getByTestId('status')).toHaveText('Disconnected');
  await page.getByLabel('Draft', {exact: true}).fill('After cleanup');
  // Wait for actual delivery before asserting that the retired handle ignored it.
  await expect
    .poll(() => other.evaluate(() => window.persistenceProbe.events))
    .toBe(2);
  await expectDraft(other, 'From second tab');
  await other.getByLabel('Draft', {exact: true}).fill('Local only');
  await expectDraft(other, 'Local only');
  expect(await other.evaluate(() => window.persistenceProbe.writes)).toBe(1);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('two-tab-draft') ?? '').state.text,
    ),
  ).toBe('After cleanup');
});

test('a remote update cancels the other tab’s pending debounce and local editing can resume', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await page.goto('/persistence?debounce=500');
  await other.goto('/persistence');
  await expectDraft(page, 'Initial');
  await expectDraft(other, 'Initial');
  await page.getByLabel('Draft', {exact: true}).fill('Pending local edit');
  await other.getByLabel('Draft', {exact: true}).fill('Remote winner');
  await expectDraft(page, 'Remote winner');
  // A negative timer assertion must observe the original debounce deadline.
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => window.persistenceProbe.writes)).toBe(0);
  expect(await other.evaluate(() => window.persistenceProbe.writes)).toBe(1);
  await page.getByLabel('Draft', {exact: true}).fill('Editing resumed');
  await expectDraft(other, 'Editing resumed');
  expect(await page.evaluate(() => window.persistenceProbe.writes)).toBe(1);
});

test('an older storage event cannot overwrite a newer local save', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await page.goto('/persistence');
  await other.goto('/persistence');
  await expectDraft(other, 'Initial');
  await other.evaluate(() =>
    window.persistenceProbe.writeOnNextEvent('Newer local save'),
  );
  await page.getByLabel('Draft', {exact: true}).fill('Older remote save');
  await expectDraft(page, 'Newer local save');
  await expectDraft(other, 'Newer local save');
  expect(
    await other.evaluate(() => window.persistenceProbe.trustedEvents),
  ).toBe(1);
  expect(
    await other.evaluate(
      () => JSON.parse(localStorage.getItem('two-tab-draft') ?? '').state.text,
    ),
  ).toBe('Newer local save');
});
