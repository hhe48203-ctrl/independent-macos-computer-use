// Documentation hygiene: relative links must resolve and every English page
// must have a Chinese counterpart under docs/zh-CN/ that links back.
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const zhDir = path.join(root, 'docs/zh-CN');
// Pages that are deliberately English-only.
const englishOnly = new Set(['docs/WORKLOG.md', 'docs/ARCHITECTURE.md']);
// Root pages whose translation lives under docs/zh-CN/ instead of mirroring the path.
const rootPairs = { 'README.md': 'docs/zh-CN/README.md', 'AGENTS.md': 'docs/zh-CN/AGENTS.md' };

export function englishPages() {
  const pages = ['README.md', 'AGENTS.md', ...readdirSync(path.join(root, 'docs'))
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => `docs/${name}`)];
  return pages.filter((page) => existsSync(path.join(root, page)));
}

const rootNames = new Set(Object.keys(rootPairs));
export function counterpart(page) {
  if (rootPairs[page]) return rootPairs[page];
  if (page.startsWith('docs/zh-CN/')) {
    const name = page.slice('docs/zh-CN/'.length);
    return rootNames.has(name) ? name : `docs/${name}`;
  }
  return page.replace(/^docs\//, 'docs/zh-CN/');
}

export function check() {
  const problems = [];
  const pages = [...englishPages(), ...readdirSync(zhDir).filter((n) => n.endsWith('.md')).map((n) => `docs/zh-CN/${n}`)];
  let links = 0;
  for (const page of pages) {
    const text = readFileSync(path.join(root, page), 'utf8');
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      links++;
      const resolved = path.resolve(path.dirname(path.join(root, page)), target.split('#')[0]);
      if (!existsSync(resolved)) problems.push(`${page}: broken link ${target}`);
    }
    const other = counterpart(page);
    if (!existsSync(path.join(root, other))) {
      if (!englishOnly.has(page)) problems.push(`${page}: missing counterpart ${other}`);
      continue;
    }
    if (!text.includes(`](${path.relative(path.dirname(page), other).split(path.sep).join('/')})`)) {
      problems.push(`${page}: no link to its counterpart (${path.basename(other)})`);
    }
  }
  return {pages: pages.length, links, problems};
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const {pages, links, problems} = check();
  for (const problem of problems) console.error(problem);
  console.log(`${pages} pages, ${links} relative links, ${problems.length} problem(s)`);
  if (problems.length) process.exitCode = 1;
}
