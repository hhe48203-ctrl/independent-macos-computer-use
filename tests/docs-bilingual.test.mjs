import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildPage, reviewedPages, outputDir, tokenize} from '../scripts/build-bilingual.mjs';

const read = (relative) => readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8');

test('reviewed pages keep the same block sequence in both languages', () => {
  for (const name of reviewedPages) {
    const en = tokenize(read(`docs/${name}.md`));
    const zh = tokenize(read(`docs/zh-CN/${name}.md`));
    assert.equal(en.length, zh.length, `${name}: block count drifted`);
    en.forEach((block, index) => {
      assert.equal(block.type, zh[index].type, `${name}: block ${index + 1} is ${block.type} in English but ${zh[index].type} in Chinese`);
    });
    assert.equal(buildPage(name).gap.length, 0, `${name}: generator reported an alignment gap`);
  }
});

test('committed bilingual review copies match their sources', () => {
  for (const name of reviewedPages) {
    const {text} = buildPage(name);
    const committed = read(`${outputDir}/${name}.bilingual.md`);
    assert.equal(committed, text, `${outputDir}/${name}.bilingual.md is stale; run npm run docs:bilingual`);
  }
});

test('each bilingual pair renders both languages for every block', () => {
  for (const name of reviewedPages) {
    const text = buildPage(name).text;
    const pairs = (text.match(/\*\*English\*\*/g) ?? []).length;
    const chinese = (text.match(/\*\*中文原文\*\*/g) ?? []).length;
    assert.ok(pairs > 20, `${name}: expected many reviewed blocks, saw ${pairs}`);
    assert.equal(pairs, chinese, `${name}: a block lost its Chinese text`);
    assert.doesNotMatch(text, /_中文缺失_/, `${name}: some block has no Chinese original`);
  }
});
