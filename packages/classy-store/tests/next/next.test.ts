import {test as base, expect} from '@playwright/test';

export const test = base.extend<{browserErrors: undefined}>({
  browserErrors: [
    async ({page}, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await use(undefined);
      expect(
        errors,
        'Browser exceptions, hydration errors, and console errors',
      ).toEqual([]);
    },
    {auto: true},
  ],
});
