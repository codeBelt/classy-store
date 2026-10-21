import {expect} from '@playwright/test';
import {test} from './browser.test';

for (const mode of ['selector', 'tracked', 'bound-selector', 'bound-tracked']) {
  test.describe(`compiled ${mode}`, () => {
    test.beforeEach(async ({page}) => {
      await page.goto(`/compiler?mode=${mode}`);
      await expect(page.getByLabel('Compiled text')).toHaveValue('abcdef');
      await expect(page.getByTestId('memo-profile')).toHaveText('Lovelace');
    });

    test('keeps controlled input values and caret after a local rerender', async ({
      page,
    }) => {
      await page.getByRole('button', {name: 'Local rerender'}).click();
      await expect(page.getByTestId('local-revision')).toHaveText('1');
      await expect(page.getByTestId('label')).toHaveText('one');
      const input = page.getByLabel('Compiled text');
      await input.focus();
      await input.evaluate((element: HTMLInputElement) =>
        element.setSelectionRange(2, 2),
      );
      await input.pressSequentially('XY');
      await expect(input).toHaveValue('abXYcdef');
      await expect(page.getByTestId('compiled-text')).toHaveText('abXYcdef');
      await expect(page.getByTestId('compiled-edits')).toHaveText('2');
      expect(
        await input.evaluate(
          (element: HTMLInputElement) => element.selectionStart,
        ),
      ).toBe(4);
      expect(await page.evaluate(() => window.compilerProbe)).toEqual({
        notifications: 1,
        notificationsDuringEvent: 0,
      });
      await input.evaluate((element: HTMLInputElement) =>
        element.setSelectionRange(2, 4),
      );
      await input.pressSequentially('Z');
      await expect(input).toHaveValue('abZcdef');
      await expect(page.getByTestId('compiled-edits')).toHaveText('3');
      expect(
        await input.evaluate(
          (element: HTMLInputElement) => element.selectionStart,
        ),
      ).toBe(3);
    });

    test('retains cached reads and follows conditional nested reads and memoized children', async ({
      page,
    }) => {
      await page.getByRole('button', {name: 'Local rerender'}).click();
      await expect(page.getByTestId('label')).toHaveText('one');
      await page.evaluate(() => {
        window.compilerStore.profile.last = 'King';
      });
      await expect(page.getByTestId('memo-profile')).toHaveText('King');
      await page.evaluate(() => {
        window.compilerStore.profile.first = 'Augusta';
      });
      await expect(page.getByTestId('conditional-name')).toHaveText('Augusta');
      await page.getByRole('button', {name: 'Toggle branch'}).click();
      await expect(page.getByTestId('conditional-name')).toHaveText('Grace');
      await page.getByRole('button', {name: 'Local rerender'}).click();
      await expect(page.getByTestId('label')).toHaveText('zero');
      await page.evaluate(() => {
        window.compilerStore.fallback.name = 'Hopper';
      });
      await expect(page.getByTestId('conditional-name')).toHaveText('Hopper');
      await page.evaluate(() => {
        window.compilerStore.profile = {first: 'Katherine', last: 'Johnson'};
      });
      await expect(page.getByTestId('memo-profile')).toHaveText('Johnson');
      await page.getByRole('button', {name: 'Toggle branch'}).click();
      await expect(page.getByTestId('conditional-name')).toHaveText(
        'Katherine',
      );
      await page.evaluate(() => {
        window.compilerStore.text = 'external';
      });
      await expect(page.getByLabel('Compiled text')).toHaveValue('external');
      await expect(page.getByTestId('compiled-text')).toHaveText('external');
    });
  });
}
