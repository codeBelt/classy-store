import {readdirSync, readFileSync} from 'node:fs';
import {expect, test} from '@playwright/test';

const site = new URL('https://codebelt.github.io/classy-store/');
const pathsFor = (section: string, extension: string) =>
  readdirSync(`content/${section}`)
    .filter((name) => name.endsWith(extension))
    .map((name) =>
      name === `index${extension}`
        ? `${section}/`
        : `${section}/${name.slice(0, -extension.length)}/`,
    );
const pages = pathsFor('docs', '.md');
const examplePages = pathsFor('examples', '.mdx');

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
  for (const path of ['', ...pages, ...examplePages]) {
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
    if (
      path.startsWith('/classy-store/docs/') ||
      path.startsWith('/classy-store/examples/') ||
      path === site.pathname
    ) {
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
  await expect(page).toHaveURL(/\/classy-store\/examples\/$/);
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

test('the sitemap, canonical URLs and share images describe every public page', async ({
  request,
  page,
}) => {
  const paths = ['', ...pages, ...examplePages];
  const sitemap = await request.get('sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const urls = await page.evaluate(
    (xml) =>
      Array.from(
        new DOMParser()
          .parseFromString(xml, 'text/xml')
          .querySelectorAll('loc'),
        (loc) => loc.textContent,
      ),
    await sitemap.text(),
  );
  expect(urls.sort()).toEqual(
    paths.map((path) => new URL(path, site).href).sort(),
  );
  const images = new Set<string>();
  for (const path of paths) {
    const meta = await page.evaluate(
      (html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return {
          canonical: doc
            .querySelector('link[rel=canonical]')
            ?.getAttribute('href'),
          image: doc
            .querySelector('meta[property="og:image"]')
            ?.getAttribute('content'),
        };
      },
      readFileSync(`out/${path}index.html`, 'utf8'),
    );
    expect(meta.canonical, path).toBe(new URL(path, site).href);
    expect(meta.image, path).toMatch(
      /^https:\/\/codebelt\.github\.io\/classy-store\/og\//,
    );
    images.add(new URL(String(meta.image)).pathname);
  }
  for (const image of images)
    expect((await request.get(image)).headers()['content-type'], image).toBe(
      'image/png',
    );
});

test('long architecture headings and the add-note form fit a phone', async ({
  page,
}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('docs/ARCHITECTURE/');
  const heading = page
    .getByRole('heading', {name: /Layer 3: React Hook/})
    .first();
  await expect(heading).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.goto('examples/persist/');
  const add = page.getByRole('button', {name: 'Add', exact: true});
  await expect(add).toBeVisible();
  const rect = await add.boundingBox();
  expect(rect && rect.x + rect.width).toBeLessThanOrEqual(390);
});
