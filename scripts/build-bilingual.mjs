// Builds a sentence-level bilingual review copy for the pages where a mistranslation
// would change a technical conclusion. The English page stays canonical; this output
// exists so a reviewer can compare both languages without opening two files.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
// Pages whose translations are reviewed line by line.
export const reviewedPages = ['REVERSE_ENGINEERING', 'FOCUS_FIDELITY'];
export const outputDir = 'docs/zh-CN/review';

export function tokenize(text) {
  const blocks = [];
  let fence = null, current = null;
  const flush = () => { if (current) { blocks.push(current); current = null; } };
  for (const line of text.split('\n')) {
    if (fence) {
      current.lines.push(line);
      if (/^```/.test(line.trim())) { fence = null; flush(); }
      continue;
    }
    if (/^```/.test(line.trim())) { flush(); fence = 'open'; current = {type: 'code', lines: [line]}; continue; }
    if (!line.trim()) { flush(); continue; }
    if (/^#{1,6}\s/.test(line)) { flush(); blocks.push({type: 'heading', lines: [line]}); continue; }
    if (/^\|/.test(line)) { if (!current || current.type !== 'table') { flush(); current = {type: 'table', lines: []}; } current.lines.push(line); continue; }
    if (/^\s*([-*]|\d+\.)\s/.test(line)) { if (!current || current.type !== 'list') { flush(); current = {type: 'list', lines: []}; } current.lines.push(line); continue; }
    if (/^---+$/.test(line.trim())) { flush(); blocks.push({type: 'rule', lines: [line]}); continue; }
    if (!current || current.type !== 'paragraph') { flush(); current = {type: 'paragraph', lines: []}; }
    current.lines.push(line);
  }
  flush();
  return blocks;
}
const joined = (block) => block.lines.join('\n').trim();
const cells = (row) => row.split('|').slice(1, -1).map((cell) => cell.trim());
const isSeparator = (row) => /^\|[\s:|-]+\|$/.test(row.trim());

export function buildPage(name) {
  const english = readFileSync(path.join(root, `docs/${name}.md`), 'utf8');
  const chinese = readFileSync(path.join(root, `docs/zh-CN/${name}.md`), 'utf8');
  const en = tokenize(english), zh = tokenize(chinese);
  const out = [
    `# Bilingual review: ${name}`,
    '',
    `Generated from [${name}.md](../../${name}.md) and [zh-CN/${name}.md](../${name}.md). English is canonical; the Chinese text is the translation under review. Inline links are copied verbatim from the sources, so they resolve relative to those pages, not to this file. Regenerate with \`npm run docs:bilingual\` after either page changes.`,
    ''
  ];
  const gap = [];
  const total = Math.max(en.length, zh.length);
  for (let index = 0; index < total; index++) {
    const a = en[index], b = zh[index];
    if (!a || !b || a.type !== b.type) {
      gap.push({index, en: a ? a.type : 'missing', zh: b ? b.type : 'missing'});
    }
    out.push(`## [${index + 1}] ${a ? a.type : 'missing'}${b ? '' : ' · 中文缺失'}`);
    out.push('');
    if (!a) { out.push('_No English block at this position._', ''); }
    else if (a.type === 'table') {
      const enRows = a.lines.filter((row) => !isSeparator(row));
      const zhRows = b && b.type === 'table' ? b.lines.filter((row) => !isSeparator(row)) : [];
      out.push('| # | English | 中文原文 |', '| --- | --- | --- |');
      for (let row = 0; row < Math.max(enRows.length, zhRows.length); row++) {
        out.push(`| ${row} | ${cells(enRows[row] ?? '').join(' · ')} | ${cells(zhRows[row] ?? '').join(' · ')} |`);
      }
      out.push('');
    } else if (a.type === 'code') {
      out.push('English:', '', '```', ...a.lines.slice(1, -1), '```', '');
      if (b && b.type === 'code') out.push('中文:', '', '```', ...b.lines.slice(1, -1), '```', '');
      out.push('');
    } else if (a.type === 'rule') {
      out.push('---', '');
    } else if (a.type === 'list') {
      out.push('**English**', '', joined(a), '');
      out.push('**中文原文**', '', b && b.type === 'list' ? joined(b) : '_中文缺失_', '');
    } else {
      out.push('**English**', '', joined(a), '');
      out.push('**中文原文**', '', b && b.type === a.type ? joined(b) : '_中文缺失_', '');
    }
  }
  if (gap.length) {
    out.unshift(
      '> **Alignment gap.** The two pages do not have the same block sequence, so the pairs below may be offset:',
      '> ' + gap.map((g) => `[${g.index + 1}] en=${g.en} zh=${g.zh}`).join(', '),
      '> Update the translation, then regenerate this file.',
      ''
    );
  }
  return {text: out.join('\n') + '\n', blocks: {en: en.length, zh: zh.length}, gap};
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  mkdirSync(path.join(root, outputDir), {recursive: true});
  for (const name of reviewedPages) {
    const {text, blocks, gap} = buildPage(name);
    writeFileSync(path.join(root, outputDir, `${name}.bilingual.md`), text);
    console.log(`${outputDir}/${name}.bilingual.md  blocks en=${blocks.en} zh=${blocks.zh} gaps=${gap.length}`);
    if (gap.length) process.exitCode = 1;
  }
}
