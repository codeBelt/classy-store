import {readdirSync, readFileSync, writeFileSync} from 'node:fs';

const docsDirectory = new URL('../docs/', import.meta.url);
const outputFile = new URL('../static/llms-full.txt', import.meta.url);
const docsUrl = 'https://codebelt.github.io/classy-store/docs/';
const introduction = [
  'index.md',
  'UPGRADING_0_8.md',
  'UPGRADING_0_7.md',
  'TUTORIAL.md',
];
const files = readdirSync(docsDirectory)
  .filter((file) => file.endsWith('.md'))
  .sort();
const orderedFiles = [
  ...introduction.filter((file) => files.includes(file)),
  ...files.filter((file) => !introduction.includes(file)),
];
const sections = orderedFiles.map((file) => {
  const route = file === 'index.md' ? '' : file.slice(0, -3);
  const content = readFileSync(new URL(file, docsDirectory), 'utf8')
    .replace(
      /\]\((?:\.\/)?([\w-]+)\.md(#[^)]*)?\)/g,
      (_, name, anchor = '') =>
        `](${docsUrl}${name === 'index' ? '' : name}${anchor})`,
    )
    .replace(/\]\((#[^)]*)\)/g, `](${docsUrl}${route}$1)`);
  return `---\nSOURCE: ${docsUrl}${route}\n---\n\n${content.trim()}\n`;
});

writeFileSync(
  outputFile,
  `# @codebelt/classy-store — Complete Documentation

Generated from the Markdown sources in website/docs by scripts/generateLlms.mjs.
Source: ${docsUrl}

${sections.join('\n')}`,
);
console.log(`Generated llms-full.txt from ${orderedFiles.length} documents.`);
