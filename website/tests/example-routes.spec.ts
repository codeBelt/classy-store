import {expect, test} from '@playwright/test';

const examples = [
  ['', 'Interactive examples'],
  ['reactivity', 'Reactivity'],
  ['collections', 'Collections'],
  ['snapshots', 'Snapshots'],
  ['use-local-store', 'useLocalStore'],
  ['scoped-stores', 'Scoped stores'],
  ['persist', 'Persist'],
  ['history', 'History'],
  ['devtools', 'DevTools'],
  ['subscribe-key', 'subscribeKey'],
  ['shallow-equal', 'shallowEqual'],
] as const;

for (const [slug, title] of examples) {
  test(`${title} exports, refreshes, appears in search and accepts both old bookmarks`, async ({
    page,
    request,
    baseURL,
  }) => {
    const route = slug ? `examples/${slug}/` : 'examples/';
    const url = new URL(route, baseURL).href;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const html = await request.get(route);
    expect(html.ok()).toBe(true);
    expect(await html.text()).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
    await page.goto(route);
    await page.reload();
    await expect(
      page.getByRole('heading', {name: title, level: 1}),
    ).toBeVisible();
    for (const legacy of ['demos/', 'demos/index.html']) {
      await page.goto(`${legacy}#/${slug}`);
      await expect(page).toHaveURL(url);
      await expect(
        page.getByRole('heading', {name: title, level: 1}),
      ).toBeVisible();
    }
    await page.goto('docs/');
    await page
      .locator('[data-search-full]:visible, [data-search]:visible')
      .first()
      .click();
    await page.getByRole('combobox').fill(title);
    const result = page
      .getByRole('option')
      .and(page.locator(`[id="fd-search-option-/${route.slice(0, -1)}"]`));
    await expect(result).toContainText('Examples');
    await result.click();
    await expect(page).toHaveURL(url);
    expect(errors).toEqual([]);
  });
}

test('bookmarks with unknown hashes return to the local directory', async ({
  page,
  baseURL,
}) => {
  await page.goto('demos/index.html?from=docs#//unrelated.example/');
  await expect(page).toHaveURL(new URL('examples/?from=docs', baseURL).href);
});

test('mobile section navigation reaches every example with the saved reading theme', async ({
  page,
}) => {
  await page.goto('examples/');
  const switchTheme = page
    .locator('#nd-sidebar')
    .getByRole('button', {name: 'Toggle Theme'});
  await switchTheme.click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.setViewportSize({width: 390, height: 844});
  for (const [slug, title] of [...examples.slice(1), examples[0]]) {
    await page
      .locator('#nd-subnav')
      .getByRole('button', {name: 'Open Sidebar'})
      .click();
    await page
      .locator('#nd-sidebar-mobile')
      .getByRole('link', {name: title, exact: true})
      .click();
    await expect(
      page.getByRole('heading', {name: title, level: 1}),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(
      slug ? `/classy-store/examples/${slug}/` : '/classy-store/examples/',
    );
    await expect(page.locator('html')).toHaveClass(/light/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      title,
    ).toBe(true);
  }
});

test('a disabled storage policy keeps the persistence article and its highlighted source accessible', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage disabled', 'SecurityError');
      },
    });
  });
  await page.goto('examples/persist/');
  await expect(
    page.getByRole('heading', {name: /^Simple Persist/, level: 2}),
  ).toBeVisible();
  await expect(
    page
      .getByText('Enable local storage to try the persistence experiments.')
      .first(),
  ).toBeVisible();
  await page.getByRole('button', {name: 'Store', exact: true}).first().click();
  await expect(page.locator('.example-source figure')).toContainText(
    'class PreferencesStore',
  );
});

test('the inspector follows debounced note saves, explicit clears and cross-tab changes', async ({
  page,
  context,
}) => {
  await page.goto('examples/persist/');
  const peer = await context.newPage();
  await peer.goto('examples/persist/');
  await page.getByPlaceholder('Note title').fill('Shared bench');
  await page
    .getByPlaceholder('Body', {exact: true})
    .fill('Saved after debounce.');
  await page.getByRole('button', {name: 'Add', exact: true}).click();
  await expect(
    page.getByRole('figure', {name: 'Stored kitchen-sink'}).locator('pre'),
  ).toContainText('Shared bench');
  await expect(peer.getByText('Shared bench', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Clear Storage', exact: true}).click();
  await expect(
    page.getByRole('figure', {name: 'Stored kitchen-sink'}).locator('pre'),
  ).toHaveText('(empty)');
});
