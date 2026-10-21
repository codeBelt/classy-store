import {test as base, expect, type Page} from '@playwright/test';

export const test = base.extend<{browserErrors: undefined}>({
  browserErrors: [
    async ({page, context}, use) => {
      const errors: string[] = [];
      function observe(tab: Page) {
        tab.on('pageerror', (error) => errors.push(error.message));
        tab.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
      }
      observe(page);
      context.on('page', observe);
      await use(undefined);
      context.off('page', observe);
      expect(errors, 'Browser exceptions and console errors').toEqual([]);
    },
    {auto: true},
  ],
});
