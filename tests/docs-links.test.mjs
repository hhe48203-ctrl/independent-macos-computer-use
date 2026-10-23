import test from 'node:test';
import assert from 'node:assert/strict';
import {check, englishPages, counterpart} from '../scripts/check-docs.mjs';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
test('documentation links resolve and every page has a linked translation', () => {
  const {problems, links, pages} = check();
  assert.deepEqual(problems, []);
  assert.ok(pages > 25, `expected the whole doc set, saw ${pages}`);
  assert.ok(links > 50, `expected many relative links, saw ${links}`);
});
test('root pages translate into docs/zh-CN and docs pages mirror their names', () => {
  assert.equal(counterpart('README.md'), 'docs/zh-CN/README.md');
  assert.equal(counterpart('AGENTS.md'), 'docs/zh-CN/AGENTS.md');
  assert.equal(counterpart('docs/JS_API.md'), 'docs/zh-CN/JS_API.md');
  assert.equal(counterpart('docs/zh-CN/JS_API.md'), 'docs/JS_API.md');
  assert.equal(counterpart('docs/zh-CN/README.md'), 'README.md');
});
test('every English page is the default location and no page silently loses its translation', () => {
  const pages = englishPages();
  assert.ok(pages.includes('README.md') && pages.includes('docs/JS_API.md') && pages.includes('docs/REVERSE_ENGINEERING.md'));
  for (const page of pages) {
    const expected = counterpart(page);
    if (page === 'docs/WORKLOG.md' || page === 'docs/ARCHITECTURE.md') {
      assert.equal(existsSync(new URL(`../${expected}`, import.meta.url)), false, `${page} is English-only by design`);
      continue;
    }
    assert.ok(existsSync(new URL(`../${expected}`, import.meta.url)), `${page} lost its translation at ${expected}`);
    const text = readFileSync(fileURLToPath(new URL(`../${page}`, import.meta.url)), 'utf8');
    assert.match(text, /中文版本|English version/, `${page} lost its language link`);
  }
});
