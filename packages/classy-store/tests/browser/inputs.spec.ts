import {expect} from '@playwright/test';
import type {browserProbe} from './browser.store';
import {test} from './browser.test';

const modes = ['selector', 'tracked', 'bound-selector', 'bound-tracked'];

for (const mode of modes) {
  test.describe(mode, () => {
    test.beforeEach(async ({page}) => {
      await page.goto(`/?mode=${mode}`);
      await expect(page.getByLabel('Text', {exact: true})).toHaveValue(
        'abcdef',
      );
    });

    test('keeps the caret during middle insertion and selection replacement', async ({
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
        await input.evaluate(
          (element: HTMLInputElement) => element.selectionStart,
        ),
      ).toBe(4);
      await expect(page.getByTestId('text')).toHaveText('abXYcdef');
      await expect(page.getByTestId('edits')).toHaveText('2');

      await input.evaluate((element: HTMLInputElement) =>
        element.setSelectionRange(2, 4),
      );
      await input.pressSequentially('Z');
      await expect(input).toHaveValue('abZcdef');
      expect(
        await input.evaluate(
          (element: HTMLInputElement) => element.selectionStart,
        ),
      ).toBe(3);
      await input.press('Backspace');
      await expect(input).toHaveValue('abcdef');
      expect(
        await input.evaluate(
          (element: HTMLInputElement) => element.selectionStart,
        ),
      ).toBe(2);
    });

    test('handles multiline input, unicode insertion, and checkbox changes', async ({
      page,
    }) => {
      const notes = page.getByLabel('Notes');
      await notes.focus();
      await notes.evaluate((element: HTMLTextAreaElement) =>
        element.setSelectionRange(5, 5),
      );
      await notes.pressSequentially('new');
      await notes.press('Enter');
      await page.keyboard.insertText('日本語');
      await expect(notes).toHaveValue('firstnew\n日本語 line');
      await expect(page.getByTestId('notes')).toHaveText(
        'firstnew\n日本語 line',
      );
      expect(
        await notes.evaluate(
          (element: HTMLTextAreaElement) => element.selectionStart,
        ),
      ).toBe(12);
      await page.getByLabel('Enabled').check();
      await expect(page.getByTestId('enabled')).toHaveText('true');
      await page.getByLabel('Enabled').uncheck();
      await expect(page.getByTestId('enabled')).toHaveText('false');
    });

    test('preserves text through a composition event sequence', async ({
      page,
    }) => {
      // Synthetic composition boundaries + native browser text insertion.
      // OS-level IME candidate selection still requires a manual smoke test.
      const input = page.getByLabel('Text', {exact: true});
      await input.focus();
      await input.evaluate((element: HTMLInputElement) =>
        element.setSelectionRange(2, 2),
      );
      await input.dispatchEvent('compositionstart', {data: ''});
      await page.keyboard.insertText('に');
      await input.dispatchEvent('compositionupdate', {data: 'に'});
      await input.dispatchEvent('compositionend', {data: 'に'});
      await expect(input).toHaveValue('abにcdef');
      await expect(page.getByTestId('text')).toHaveText('abにcdef');
      expect(
        await input.evaluate(
          (element: HTMLInputElement) => element.selectionStart,
        ),
      ).toBe(3);
      // Firefox's insertText also emits its own composition boundaries.
      const compositions = await page.evaluate(
        () => window.browserProbe.compositions,
      );
      expect(compositions[0]).toBe('start');
      expect(compositions.at(-1)).toBe('end');
      expect(compositions.filter((event) => event === 'start').length).toBe(
        compositions.filter((event) => event === 'end').length,
      );
    });

    test('commits multi-property and array updates together while ordinary subscriptions batch', async ({
      page,
    }) => {
      await page.getByRole('button', {name: 'Update together'}).click();
      await expect(page.getByTestId('full-name')).toHaveText('Ada Lovelace');
      await expect(page.getByTestId('items')).toHaveText('z,c,x');
      const probe: typeof browserProbe = await page.evaluate(
        () => window.browserProbe,
      );
      expect(probe.notificationsDuringEvent).toBe(0);
      expect(probe.notifications).toBe(1);
      expect(probe.commits).toEqual(['Ada Lovelace:z,c,x']);
    });
  });
}
