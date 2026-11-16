import {readdirSync, readFileSync} from 'node:fs';
import {expect, test} from '@playwright/test';

const site = new URL('https://codebelt.github.io/classy-store/');
const pages = readdirSync('content/docs')
  .filter((name) => name.endsWith('.md'))
  .map((name) =>
    name === 'index.md' ? 'docs/' : `docs/${name.slice(0, -3)}/`,
  );

test('exported docs, README links, and section anchors resolve on Pages', async ({
  page,
  request,
}) => {
  const idsByPath = new Map<string, Set<string>>();
  const links = new Set<string>();
  const readme = readFileSync('../README.md', 'utf8');
  for (const [href] of readme.matchAll(
    /https:\/\/codebelt\.github\.io\/classy-store\/[^\s)]*/gi,
  )) {
    links.add(href);
  }
  for (const path of ['', ...pages]) {
    const url = new URL(path, site);
    const html = readFileSync(`out/${path}index.html`, 'utf8');
    const {ids, hrefs} = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return {
        ids: Array.from(doc.querySelectorAll('[id]'), (el) => el.id),
        hrefs: Array.from(
          doc.querySelectorAll('a[href]'),
          (el) => el.getAttribute('href') ?? '',
        ),
      };
    }, html);
    idsByPath.set(url.pathname, new Set(ids));
    for (const href of hrefs) links.add(new URL(href, url).href);
  }

  const assets = new Set<string>();
  for (const href of links) {
    const url = new URL(href);
    if (url.origin !== site.origin) continue;
    expect(url.pathname, href).toMatch(/^\/classy-store(?:\/|$)/);
    const path = url.pathname.replace(/\/?$/, '/');
    if (path.startsWith('/classy-store/docs/') || path === site.pathname) {
      const ids = idsByPath.get(path);
      expect(ids, href).toBeDefined();
      if (url.hash)
        expect(ids, href).toContain(decodeURIComponent(url.hash.slice(1)));
    } else {
      assets.add(url.pathname);
    }
  }
  for (const path of assets)
    expect((await request.get(path)).ok(), path).toBe(true);
});

test('each guide has Markdown, a preview image, and an entry in both LLM files', async ({
  request,
}) => {
  const index = await (await request.get('llms.txt')).text();
  const full = await (await request.get('llms-full.txt')).text();
  for (const path of pages) {
    expect(index).toContain(`](${new URL(path.slice(0, -1), site).href})`);
    const response = await request.get(`llms.mdx/${path}content.md`);
    expect(response.ok(), path).toBe(true);
    const markdown = await response.text();
    expect(markdown).toMatch(/^# /);
    expect(full).toContain(markdown);
    const image = await request.get(`og/${path}image.png`);
    expect(image.headers()['content-type']).toBe('image/png');
  }
  expect(full).not.toMatch(/\]\(\.\.?\/[^)]*\.md[#)]/);
});

test('published bookmarks lead to their reference section', async ({page}) => {
  for (const hash of [
    'package-entry-points',
    'usepersiststatushandle',
    'usehistorystatushistory',
    'react-compiler-compatibility',
  ]) {
    await page.goto(`docs/#${hash}`);
    await expect(page).toHaveURL(
      new RegExp(`/classy-store/docs/API_REFERENCE/#${hash}$`),
    );
    await expect(
      page.locator(`h2[id="${hash}"], h3[id="${hash}"]`),
    ).toBeVisible();
  }
});

test('search, copy Markdown, and the React demo work from the project subpath', async ({
  page,
  context,
}) => {
  await page.goto('docs/');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin,
  });
  await page
    .locator('[data-search-full]:visible, [data-search]:visible')
    .first()
    .click();
  await page.getByRole('combobox').fill('Angular 22');
  const result = page
    .getByRole('option')
    .filter({hasText: 'Angular 22'})
    .first();
  await result.click();
  await expect(page).toHaveURL(/\/classy-store\/docs\/ANGULAR\//);
  await page.getByRole('button', {name: 'Copy Markdown'}).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('# Angular 22');
  await page.goto('./');
  await page.getByRole('link', {name: 'Explore examples'}).click();
  await expect(page).toHaveURL(/\/classy-store\/demos\/index.html/);
  await expect(
    page.getByRole('heading', {name: 'Interactive examples', exact: true}),
  ).toBeVisible();
});

test('architecture diagrams render on a narrow screen', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  for (const slug of ['ARCHITECTURE', 'PERSIST_ARCHITECTURE']) {
    const source = readFileSync(`content/docs/${slug}.md`, 'utf8');
    const count = [...source.matchAll(/^```mermaid$/gm)].length;
    await page.goto(`docs/${slug}/`);
    await expect(page.locator('svg[id^="classy-store-"]')).toHaveCount(count);
    await expect(page.locator('.error-icon, .error-text')).toHaveCount(0);
  }
});
