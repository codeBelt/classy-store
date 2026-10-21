import {writeFile} from 'node:fs/promises';
import {expect, type Page} from '@playwright/test';
import {analyzeCompilerEvidence} from './compilerEvidence';
import {test} from './next.test';
import type {NextDiagnostics} from './next.types';

async function diagnostics(page: Page): Promise<NextDiagnostics> {
  return page.evaluate(() => Reflect.get(window, '__classyNextDiagnostics'));
}

async function expectTextConsumers(page: Page, scope: string, text: string) {
  await expect(page.getByTestId(`${scope}-input`)).toHaveValue(text);
  await expect(page.getByTestId(`${scope}-selector`)).toHaveText(text);
  await expect(page.getByTestId(`${scope}-tracked`)).toHaveText(text);
}

test('the production consumers prove whether React Compiler transformed their hooks', async ({
  page,
}, testInfo) => {
  await page.goto('/workspace/alpha');
  await page.waitForFunction(() =>
    Boolean(Reflect.get(window, '__classyNextCompilerSources')),
  );
  const sources: {selector: string; tracked: string} = await page.evaluate(() =>
    Reflect.get(window, '__classyNextCompilerSources'),
  );
  expect(Object.keys(sources).sort()).toEqual(['selector', 'tracked']);
  // Next App Router can use its vendored runtime rather than npm React's version.
  const reactVersion = await page.evaluate(() =>
    Reflect.get(window, '__classyNextReactVersion'),
  );
  expect(reactVersion).toEqual(expect.stringMatching(/^\d+\.\d+\.\d+/));
  const evidence = Object.fromEntries(
    Object.entries(sources).map(([consumer, source]) => [
      consumer,
      analyzeCompilerEvidence(source),
    ]),
  );
  const sourcePath = testInfo.outputPath('production-consumer-functions.json');
  await writeFile(
    sourcePath,
    JSON.stringify({reactVersion, sources, evidence}, null, 2),
  );
  await testInfo.attach('production-consumer-functions', {
    path: sourcePath,
    contentType: 'application/json',
  });
  for (const [consumer, source] of Object.entries(sources)) {
    expect(source, `${consumer} has an inspectable function body`).toContain(
      'function',
    );
    const {slotCount, readSlots, writtenSlots} = evidence[consumer];
    if (process.env.NEXT_TEST_COMPILER === 'on') {
      expect(
        slotCount,
        `${consumer} allocates Compiler memo-cache slots`,
      ).toBeGreaterThan(0);
      expect(
        readSlots.length,
        `${consumer} reads cached slots`,
      ).toBeGreaterThan(0);
      expect(
        writtenSlots.length,
        `${consumer} writes cached slots`,
      ).toBeGreaterThan(0);
      expect(Math.max(...readSlots, ...writtenSlots)).toBeLessThan(slotCount);
    } else {
      expect(
        slotCount,
        `${consumer} has no Compiler memo-cache allocation`,
      ).toBe(0);
    }
  }
});

test('packed server imports create isolated request stores', async ({
  request,
}) => {
  const seeds = Array.from({length: 6}, () => crypto.randomUUID());
  const responses = await Promise.all(
    seeds.map(async (seed) => {
      const response = await request.get(`/?seed=${seed}`);
      expect(response.status()).toBe(200);
      return {seed, html: await response.text()};
    }),
  );
  for (const {seed, html} of responses) {
    expect(html).toContain(`data-testid="request-seed">${seed}</output>`);
    expect(html).toContain(
      `data-testid="server-imports">${seed}|${seed}:updated|1</output>`,
    );
    for (const consumer of ['selector', 'tracked']) {
      expect(html).toContain(
        `data-testid="request-${consumer}">server:${seed}</output>`,
      );
    }
    for (const otherSeed of seeds) {
      if (otherSeed !== seed) expect(html).not.toContain(otherSeed);
    }
  }
});

test('selectors and auto-tracking keep real controlled inputs and caret positions current', async ({
  page,
}) => {
  await page.goto('/workspace/alpha');
  await expectTextConsumers(page, 'workspace-shared', 'shared:initial');
  await expectTextConsumers(page, 'route', 'alpha:initial');
  const sharedInput = page.getByTestId('workspace-shared-input');
  await sharedInput.fill('Shared');
  await sharedInput.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(2, 2),
  );
  await sharedInput.pressSequentially('XY');
  await expectTextConsumers(page, 'workspace-shared', 'ShXYared');
  expect(
    await sharedInput.evaluate(
      (element: HTMLInputElement) => element.selectionStart,
    ),
  ).toBe(4);

  const routeInput = page.getByTestId('route-input');
  await routeInput.fill('Local');
  await routeInput.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(1, 1),
  );
  await routeInput.pressSequentially('12');
  await expectTextConsumers(page, 'route', 'L12ocal');
  expect(
    await routeInput.evaluate(
      (element: HTMLInputElement) => element.selectionStart,
    ),
  ).toBe(3);
  await expectTextConsumers(page, 'workspace-shared', 'ShXYared');
});

test('layout stores survive client navigation while route stores reset and clean up', async ({
  page,
}) => {
  await page.goto('/workspace/alpha');
  await expect(page.getByTestId('current-route')).toHaveText('alpha');
  await expect.poll(async () => (await diagnostics(page)).routeMounts).toBe(1);
  expect(await diagnostics(page)).toMatchObject({
    sharedMounts: 1,
    activePersistence: 2,
  });
  const documentSentinel = crypto.randomUUID();
  await page.evaluate((sentinel) => {
    Reflect.set(window, '__classyNextDocumentSentinel', sentinel);
  }, documentSentinel);
  await page.getByTestId('workspace-shared-input').fill('shared across routes');
  await page.getByTestId('route-input').fill('alpha edited');

  await page.getByTestId('link-beta').click();
  await expect(page).toHaveURL(/\/workspace\/beta$/);
  await expect(page.getByTestId('current-route')).toHaveText('beta');
  await expectTextConsumers(page, 'workspace-shared', 'shared across routes');
  await expectTextConsumers(page, 'route', 'beta:initial');
  await expect
    .poll(async () => (await diagnostics(page)).routeDisposes)
    .toBe(1);
  await page.getByTestId('route-input').fill('beta edited');

  await page.goBack();
  await expect(page).toHaveURL(/\/workspace\/alpha$/);
  await expectTextConsumers(page, 'workspace-shared', 'shared across routes');
  await expectTextConsumers(page, 'route', 'alpha:initial');
  await expect
    .poll(async () => (await diagnostics(page)).routeDisposes)
    .toBe(2);

  await page.goForward();
  await expect(page).toHaveURL(/\/workspace\/beta$/);
  await expectTextConsumers(page, 'workspace-shared', 'shared across routes');
  await expectTextConsumers(page, 'route', 'beta:initial');
  await expect
    .poll(async () => (await diagnostics(page)).routeDisposes)
    .toBe(3);
  await page.getByTestId('route-input').fill('beta refreshed');
  const beforeRefresh = await diagnostics(page);
  const previousRequest = await page
    .getByTestId('route-request-id')
    .textContent();
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().includes('/workspace/beta') &&
      response.request().headers().rsc === '1',
  );
  await page.getByTestId('workspace-refresh').click();
  expect((await refreshed).ok()).toBe(true);
  await expect(page.getByTestId('route-request-id')).not.toHaveText(
    previousRequest ?? '',
  );
  await expectTextConsumers(page, 'workspace-shared', 'shared across routes');
  await expectTextConsumers(page, 'route', 'beta refreshed');
  expect(await diagnostics(page)).toMatchObject({
    sharedMounts: 1,
    sharedDisposes: 0,
    routeMounts: beforeRefresh.routeMounts,
    routeDisposes: beforeRefresh.routeDisposes,
    activePersistence: 2,
  });

  await page.getByTestId('link-home').click();
  await expect(page.getByTestId('server-imports')).toBeVisible();
  await expect
    .poll(async () => (await diagnostics(page)).sharedDisposes)
    .toBe(1);
  await expect
    .poll(async () => (await diagnostics(page)).routeDisposes)
    .toBe(4);
  await expect
    .poll(async () => (await diagnostics(page)).activePersistence)
    .toBe(1);
  const writesBeforeRetiredStoreMutations = (await diagnostics(page))
    .persistenceWrites;
  expect(
    await page.evaluate(async () => {
      const mutated = Reflect.get(window, '__classyNextMutateDisposedStores')();
      await Promise.resolve();
      await Promise.resolve();
      return mutated;
    }),
  ).toBe(2);
  expect((await diagnostics(page)).persistenceWrites).toBe(
    writesBeforeRetiredStoreMutations,
  );
  expect(
    await page.evaluate(() =>
      Reflect.get(window, '__classyNextDocumentSentinel'),
    ),
  ).toBe(documentSentinel);

  await page.getByTestId('link-alpha').click();
  await expectTextConsumers(page, 'workspace-shared', 'shared:initial');
  await expectTextConsumers(page, 'route', 'alpha:initial');
  await expect.poll(async () => (await diagnostics(page)).sharedMounts).toBe(2);
  await expect.poll(async () => (await diagnostics(page)).routeMounts).toBe(5);
  expect(await diagnostics(page)).toMatchObject({activePersistence: 2});
});

test('the production response streams its fallback before the server boundary resolves', async ({
  baseURL,
  request,
}) => {
  const ticket = crypto.randomUUID();
  const seed = crypto.randomUUID();
  const response = await fetch(
    new URL(`/stream?seed=${seed}&ticket=${ticket}`, baseURL),
    {signal: AbortSignal.timeout(20_000)},
  );
  expect(response.status).toBe(200);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The streamed response has no readable body');
  const decoder = new TextDecoder();
  let html = '';
  let released = false;
  try {
    while (!html.includes('data-testid="stream-fallback"')) {
      const chunk = await reader.read();
      expect(
        chunk.done,
        'The fallback must arrive while the server gate is closed',
      ).toBe(false);
      html += decoder.decode(chunk.value, {stream: true});
    }
    expect(html).not.toContain('data-testid="stream-selector"');
    expect(html).not.toContain('data-testid="stream-tracked"');
    const release = await request.post('/api/stream-gate', {data: {ticket}});
    expect(release.ok()).toBe(true);
    released = true;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, {stream: true});
    }
    html += decoder.decode();
    expect(html).toContain(
      `data-testid="stream-selector">server:${seed}:0</output>`,
    );
    expect(html).toContain(
      `data-testid="stream-tracked">server:${seed}:0</output>`,
    );
    expect(html.indexOf('data-testid="stream-selector"')).toBeGreaterThan(
      html.indexOf('data-testid="stream-fallback"'),
    );
  } finally {
    if (!released) await request.post('/api/stream-gate', {data: {ticket}});
    await reader.cancel();
  }
});

test('persistence restores before a streamed boundary hydrates without replacing server DOM', async ({
  page,
  request,
}) => {
  const ticket = crypto.randomUUID();
  const seed = crypto.randomUUID();
  await page.addInitScript((persistedText) => {
    localStorage.setItem(
      'classy-next-stream',
      JSON.stringify({version: 0, state: {text: persistedText, count: 7}}),
    );
  }, `persisted:${seed}`);
  await page.goto(`/stream?seed=${seed}&ticket=${ticket}`, {
    waitUntil: 'commit',
  });
  await expect(page.getByTestId('stream-fallback')).toBeVisible();
  expect((await request.post('/api/stream-gate', {data: {ticket}})).ok()).toBe(
    true,
  );
  await expect(page.getByTestId('stream-selector')).toHaveText(
    `server:${seed}:0`,
  );
  await expect(page.getByTestId('stream-tracked')).toHaveText(
    `server:${seed}:0`,
  );
  await expect(page.getByTestId('stream-input')).toHaveValue(`server:${seed}`);
  await expect
    .poll(async () => (await diagnostics(page)).streamRestored)
    .toBe(true);
  await expect(page.getByTestId('stream-restored-value')).toHaveText(
    `persisted:${seed}:7`,
  );
  await page.waitForFunction(
    () =>
      typeof Reflect.get(window, '__classyNextReleaseStream') === 'function',
  );
  expect(await diagnostics(page)).toMatchObject({
    streamParentHydrated: true,
    streamChildHydrated: false,
    streamRestoredValue: `persisted:${seed}:7`,
    persistenceRestores: 1,
  });
  const serverElements = await page.evaluateHandle(() => [
    document.querySelector('[data-testid="stream-selector"]'),
    document.querySelector('[data-testid="stream-tracked"]'),
    document.querySelector('[data-testid="stream-input"]'),
  ]);
  await page.evaluate(() => Reflect.get(window, '__classyNextReleaseStream')());
  await expect(page.getByTestId('stream-selector')).toHaveText(
    `persisted:${seed}:7`,
  );
  await expect(page.getByTestId('stream-tracked')).toHaveText(
    `persisted:${seed}:7`,
  );
  await expect(page.getByTestId('stream-input')).toHaveValue(
    `persisted:${seed}`,
  );
  await expect
    .poll(async () => (await diagnostics(page)).streamChildHydrated)
    .toBe(true);
  expect(
    await serverElements.evaluate((elements) => {
      const current = [
        document.querySelector('[data-testid="stream-selector"]'),
        document.querySelector('[data-testid="stream-tracked"]'),
        document.querySelector('[data-testid="stream-input"]'),
      ];
      return elements.every(
        (element, index) => element !== null && element === current[index],
      );
    }),
  ).toBe(true);
  await serverElements.dispose();
  const input = page.getByTestId('stream-input');
  await input.fill('Edited');
  await input.evaluate((element: HTMLInputElement) =>
    element.setSelectionRange(2, 2),
  );
  await input.pressSequentially('XY');
  await expect(input).toHaveValue('EdXYited');
  await expect(page.getByTestId('stream-selector')).toHaveText('EdXYited:10');
  await expect(page.getByTestId('stream-tracked')).toHaveText('EdXYited:10');
  expect(
    await input.evaluate((element: HTMLInputElement) => element.selectionStart),
  ).toBe(4);
});
