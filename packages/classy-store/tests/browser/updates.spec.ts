import {expect} from '@playwright/test';
import {test} from './browser.test';

const modes = ['selector', 'tracked', 'bound-selector', 'bound-tracked'];

test('recovers derived selectors from intermediate multi-write states without errors', async ({
  page,
}) => {
  await page.goto('/?mode=derived');
  await expect(page.getByTestId('derived-values')).toHaveText(
    'Ada|Ada|Ada,Grace,Linus|Ada,Grace,Linus',
  );
  await page.getByRole('button', {name: 'Replace selection'}).click();
  await expect(page.getByTestId('derived-values')).toHaveText(
    'Hedy|Hedy|Katherine,Linus,Hedy|Katherine,Linus,Hedy',
  );
  await expect(page.locator('#notifications-during-event')).toHaveText('0');
  expect(await page.getByTestId('derived-commits').textContent()).toBe(
    'Ada|Ada|Ada,Grace,Linus|Ada,Grace,Linus\nHedy|Hedy|Katherine,Linus,Hedy|Katherine,Linus,Hedy\n',
  );
});

for (const mode of modes) {
  test(`${mode}: native clipboard paste replaces selection and preserves caret`, async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Clipboard permissions are Chromium-specific',
    );
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/?mode=${mode}`);
    const input = page.getByLabel('Text', {exact: true});
    await expect(input).toHaveValue('abcdef');
    await page.evaluate(() => navigator.clipboard.writeText('pasted 日本語'));
    await input.focus();
    await input.evaluate((element: HTMLInputElement) =>
      element.setSelectionRange(2, 4),
    );
    await input.press('ControlOrMeta+V');
    await expect(input).toHaveValue('abpasted 日本語ef');
    await expect(page.getByTestId('text')).toHaveText('abpasted 日本語ef');
    expect(
      await input.evaluate(
        (element: HTMLInputElement) => element.selectionStart,
      ),
    ).toBe(12);
    await input.pressSequentially('!');
    await expect(input).toHaveValue('abpasted 日本語!ef');
  });
}
