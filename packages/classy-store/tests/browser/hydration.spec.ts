import {expect} from '@playwright/test';
import {test} from './browser.test';
import {hydrationStorageKey} from './hydration/hydration.store';

for (const rendering of ['complete', 'streaming']) {
  test(`${rendering}: hydrates a delayed Suspense boundary from server state after parent persistence restores`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({storageKey}) => {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            version: 0,
            state: {user: {name: 'Saved'}, count: 8},
          }),
        );
      },
      {storageKey: hydrationStorageKey},
    );
    const streamId = crypto.randomUUID();
    await page.goto(
      rendering === 'streaming'
        ? `/hydration/stream?id=${streamId}`
        : '/hydration',
      {waitUntil: 'commit'},
    );
    if (rendering === 'streaming') {
      await expect(page.getByText('Loading fields')).toBeVisible();
      // Start hydration at a deterministic shell stage. Browser scheduling of
      // bootstrap scripts while a response remains open differs across engines.
      await page.addScriptTag({url: '/hydration/client.js'});
    }
    await page.waitForFunction(() => window.hydrationRuntime?.probe.restored);

    expect(
      await page.evaluate(() => ({
        name: window.hydrationRuntime.store.user.name,
        parentHydrated: window.hydrationRuntime.probe.parentHydrated,
        childHydrated: window.hydrationRuntime.probe.childHydrated,
        valuesRead: window.hydrationRuntime.probe.valuesRead,
      })),
    ).toEqual({
      name: 'Saved',
      parentHydrated: true,
      childHydrated: false,
      valuesRead: [],
    });
    if (rendering === 'streaming') {
      await expect(page.getByText('Loading fields')).toBeVisible();
      const response = await page.request.post(
        `/hydration/release?id=${streamId}`,
      );
      expect(response.ok()).toBe(true);
      await expect(page.getByTestId('hydration-selector')).toHaveText(
        'Server:1',
      );
      await page.evaluate(() => {
        window.hydrationRuntime.probe.serverElements = [
          ...document.querySelectorAll(
            '#hydration-root output, #hydration-root input',
          ),
        ];
      });
    }
    await expect(page.getByTestId('hydration-selector')).toHaveText('Server:1');
    await expect(page.getByLabel('Hydrated name')).toHaveValue('Server');

    await page.evaluate(() => window.hydrationRuntime.gate.release());
    for (const mode of [
      'selector',
      'tracked',
      'bound-selector',
      'bound-tracked',
    ]) {
      await expect(page.getByTestId(`hydration-${mode}`)).toHaveText('Saved:8');
    }
    await page.waitForFunction(
      () => window.hydrationRuntime.probe.childHydrated,
    );
    expect(
      await page.evaluate(() => ({
        recoverableErrors: window.hydrationRuntime.probe.recoverableErrors,
        firstValue: window.hydrationRuntime.probe.valuesRead[0],
        elementCount: window.hydrationRuntime.probe.serverElements.length,
        retainedElements: window.hydrationRuntime.probe.serverElements.every(
          (element, index) =>
            element ===
            document.querySelectorAll(
              '#hydration-root output, #hydration-root input',
            )[index],
        ),
      })),
    ).toEqual({
      recoverableErrors: [],
      firstValue: 'Server:1',
      elementCount: 5,
      retainedElements: true,
    });

    const input = page.getByLabel('Hydrated name');
    await input.focus();
    await input.evaluate((element: HTMLInputElement) =>
      element.setSelectionRange(2, 2),
    );
    await input.pressSequentially('XY');
    await expect(input).toHaveValue('SaXYved');
    for (const mode of [
      'selector',
      'tracked',
      'bound-selector',
      'bound-tracked',
    ]) {
      await expect(page.getByTestId(`hydration-${mode}`)).toHaveText(
        'SaXYved:10',
      );
    }
    expect(
      await input.evaluate(
        (element: HTMLInputElement) => element.selectionStart,
      ),
    ).toBe(4);
  });
}
