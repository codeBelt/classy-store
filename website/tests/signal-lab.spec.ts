import {expect, type Page, test} from '@playwright/test';

const example = (slug = '') => (slug ? `examples/${slug}/` : 'examples/');
const control = (page: Page, name: string) =>
  page.getByRole('button', {name, exact: true});

test('the live bench, theme switch and docs-to-demo links work under the project prefix', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveClass(/dark/);
  const reading = page.locator('.home-controls output');
  await expect(reading).toHaveText('Count 2');
  const trace = page.locator('.count-trace');
  const initial = await trace.getAttribute('d');
  await control(page, 'Increment +').focus();
  await page.keyboard.press('Enter');
  await expect(reading).toHaveText('Count 3');
  await expect(trace).not.toHaveAttribute('d', initial ?? '');
  await control(page, 'Reset').click();
  await expect(reading).toHaveText('Count 0');
  await expect(
    page.locator('.home-source figure span[style]').first(),
  ).toBeVisible();
  await control(page, 'Toggle Theme').filter({visible: true}).first().click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.goto('docs/API_REFERENCE/');
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.getByRole('link', {name: /Open snapshots example/}).click();
  await expect(page).toHaveURL(/\/classy-store\/examples\/snapshots\/$/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page
    .locator('#nd-sidebar')
    .getByRole('button', {name: 'Toggle Theme'})
    .click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.goto('docs/REACT_SCOPING/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('link', {name: 'scoped editors demo'}).click();
  await expect(page).toHaveURL(/\/classy-store\/examples\/scoped-stores\/$/);
});

test('reactivity controls update only their channels, measure a batch and reset', async ({
  page,
}) => {
  await page.goto(example('reactivity'));
  const count = page.locator('.scope-readout');
  const amber = page.locator('.event-trace');
  await control(page, '+ Count').click();
  await expect(count).toHaveText('Count 1');
  const before = await amber.getAttribute('d');
  await control(page, 'Change Name').click();
  await expect(amber).not.toHaveAttribute('d', before ?? '');
  await expect(page.getByText('Bun', {exact: true})).toBeVisible();
  await expect(count).toHaveText('Count 1');
  await control(page, '+1000 Batch').click();
  await expect(
    page.getByText('1000 mutations · 1 observed render(s)'),
  ).toBeVisible();
  await page.getByRole('textbox', {name: /Name Input/}).fill('Ada');
  await control(page, 'Reset').click();
  await expect(count).toHaveText('Count 0');
  await expect(page.getByRole('textbox', {name: /Name Input/})).toHaveValue(
    'Alice',
  );
  await expect(page.getByText('World', {exact: true})).toBeVisible();
  await control(page, 'Fetch Posts').click();
  await expect(
    page.getByText('Introduction to Classy Store', {exact: true}),
  ).toBeVisible();
});

test('history controls change the editor, length trace and recording state', async ({
  page,
}) => {
  await page.goto(example('history'));
  const title = page.getByRole('textbox', {name: 'Title', exact: true});
  const undo = control(page, 'Undo');
  const redo = control(page, 'Redo');
  await expect(undo).toBeDisabled();
  const trace = page.locator('.count-trace');
  const start = await trace.getAttribute('d');
  await title.fill('Draft');
  await expect(undo).toBeEnabled();
  await expect(trace).not.toHaveAttribute('d', start ?? '');
  await undo.click();
  await expect(title).toHaveValue('Untitled Document');
  await redo.click();
  await expect(title).toHaveValue('Draft');
  await control(page, 'Pause').click();
  await page.getByRole('textbox', {name: 'Content'}).fill('Notes');
  await expect(page.getByText('Paused', {exact: true})).toBeVisible();
  await expect(page.getByText('Document length · 10 characters')).toBeVisible();
  await control(page, 'Resume').click();
  await expect(page.getByText('Recording', {exact: true})).toBeVisible();
  await control(page, 'Reset').click();
  await expect(title).toHaveValue('Untitled Document');
});

test('snapshot edits identify changed branches, preserve shared ones and log each mutation', async ({
  page,
}) => {
  await page.goto(example('snapshots'));
  const row = (name: string) =>
    page
      .locator('.ref-tree li')
      .filter({has: page.getByText(name, {exact: true})});
  await control(page, 'Edit Title').click();
  await expect(row('root')).toContainText('new ref');
  await expect(row('.metadata')).toContainText('new ref');
  await expect(row('.settings')).toContainText('same ref');
  await expect(row('.content')).toContainText('same ref');
  await control(page, 'Edit Section 1 Body').click();
  await expect(row('.sections[0]')).toContainText('new ref');
  await expect(row('.sections[1]')).toContainText('same ref');
  await control(page, 'Edit Section 2 Body').click();
  await expect(row('.sections[1]')).toContainText('new ref');
  await page
    .locator('main')
    .getByRole('button', {name: 'Toggle Theme', exact: true})
    .click();
  await expect(row('.settings')).toContainText('new ref');
  await expect(page.getByText(/title="My Report" theme=light/)).toBeVisible();
});

test('the directory opens its live todo example', async ({page}) => {
  await page.goto(example());
  await expect(page.locator('.example-directory a')).toHaveCount(10);
  await control(page, 'Try it live').click();
  await page.getByPlaceholder('Add a todo...').fill('Run the scope');
  await control(page, 'Add').click();
  await expect(page.getByText('Run the scope', {exact: true})).toBeVisible();
});

test('collections clears real tags', async ({page}) => {
  await page.goto(example('collections'));
  await control(page, 'Clear Tags').click();
  await expect(page.getByText('No tags. Add one below.')).toBeVisible();
});

test('switching source tabs preserves local counter instances', async ({
  page,
}) => {
  await page.goto(example('use-local-store'));
  await control(page, '+').first().click();
  await control(page, 'Store').click();
  await expect(page.locator('.example-source figure')).toContainText(
    'class LocalCounterStore',
  );
  await control(page, 'Component').click();
  await expect(page.locator('.example-source figure')).toContainText(
    'function CounterInstance',
  );
  await expect(
    page.locator('.example-source figure span[style]').first(),
  ).toBeVisible();
  await control(page, 'Demo').click();
  await expect(page.getByText('1', {exact: true})).toHaveCount(1);
  await expect(page.getByText('0', {exact: true})).toHaveCount(2);
});

test('a draft stays inside its editor scope', async ({page}) => {
  await page.goto(example('scoped-stores'));
  await page.getByLabel('Left editor title').fill('Local change');
  await expect(page.getByLabel('Left editor preview')).toContainText(
    'Local change',
  );
  await expect(page.getByLabel('Right editor title')).toHaveValue(
    'Right draft',
  );
});

test('preferences survive a refresh', async ({page}) => {
  await page.goto(example('persist'));
  const slider = page.getByRole('slider', {name: 'Font size'});
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('24');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('preferences')))
    .toContain('24');
  await page.reload();
  await expect(slider).toHaveValue('24');
});

test('DevTools counter works without the browser extension', async ({page}) => {
  await page.goto(example('devtools'));
  await control(page, '+1').click();
  await expect(page.getByText('1', {exact: true})).toBeVisible();
});

test('only the changed property logs an event', async ({page}) => {
  await page.goto(example('subscribe-key'));
  await control(page, 'Increment Count').click();
  await expect(page.getByText(/0 → 1/)).toBeVisible();
  await expect(page.getByText('No events yet', {exact: true})).toHaveCount(1);
});

test('both selected names update after a first-name edit', async ({page}) => {
  await page.goto(example('shallow-equal'));
  await control(page, 'Change First Name').click();
  await expect(page.getByText('Bob Smith', {exact: true})).toHaveCount(2);
});

test('mobile and reduced motion preserve navigation, controls and readable text', async ({
  page,
}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.emulateMedia({reducedMotion: 'reduce'});
  for (const url of [
    './',
    'docs/',
    example('reactivity'),
    example('history'),
    example('snapshots'),
  ]) {
    await page.goto(url, {waitUntil: 'networkidle'});
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        Array.from(document.images)
          .filter((image) => !image.complete || !image.naturalWidth)
          .map((image) => image.src),
      ),
    ).toEqual([]);
  }
  await control(page, 'Open Sidebar').click();
  await page
    .locator('#nd-sidebar-mobile')
    .getByRole('link', {name: 'History', exact: true})
    .click();
  await expect(
    page.getByRole('heading', {name: 'History', exact: true}),
  ).toBeVisible();
});
