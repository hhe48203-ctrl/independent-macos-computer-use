// Rebuild the README figures in docs/assets/.
//
//   node scripts/render-readme-visuals.mjs
//   node scripts/render-readme-visuals.mjs --preview /tmp/readme-frames
//
// Needs ffmpeg with the drawtext filter (libfreetype) and a sans plus a
// monospace font. It does not record a desktop, invent tool results, or call
// the network. The session GIF is an API illustration: the strings below are
// the public calls, and every other label is schematic.
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, openSync, writeSync, closeSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const assetDir = join(root, 'docs/assets');
const scratch = mkdtempSync(join(tmpdir(), 'readme-visuals-'));
let textSerial = 0;

// Real JS API surface. Placeholders match the README: pid, windowId, and the
// element index are not a live window or a measured result.
const CALL_1 = [
  'const state = await cua.getState();',
  'let app = await cua.getApp({pid, windowId});',
];
const CALL_2 = [
  'await app.getAXStateAndScreenshot();',
  'await app.click(7);',
];

const GIF_W = 960;
const GIF_H = 544;
const FPS = 10;

const paper = hex('#f3f6f7');
const ink = hex('#1a2b30');
const muted = hex('#5d7178');
const line = hex('#d3dde1');
const edge = hex('#d0d8dc');
const teal = hex('#0f766e');
const tealSoft = hex('#e5f6f4');
const amber = hex('#8a4e16');
const amberSoft = hex('#fbf3e8');
const white = hex('#ffffff');
const codeBg = hex('#172026');
const codeHeader = hex('#24323a');

function hex(value) {
  const n = value.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), 255];
}

function findFont(candidates) {
  for (const candidate of candidates) {
    try {
      statSync(candidate);
      return candidate;
    } catch { /* try the next family */ }
  }
  throw new Error(`No font found. Looked for:\n${candidates.join('\n')}`);
}

function loadFont(file) {
  const buf = readFileSync(file);
  const numTables = buf.readUInt16BE(4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables.set(buf.toString('latin1', rec, rec + 4), {
      offset: buf.readUInt32BE(rec + 8),
      length: buf.readUInt32BE(rec + 12),
    });
  }
  const head = tables.get('head').offset;
  const unitsPerEm = buf.readUInt16BE(head + 18);
  const hhea = tables.get('hhea').offset;
  const ascender = buf.readInt16BE(hhea + 4);
  const descender = buf.readInt16BE(hhea + 6);
  const numberOfHMetrics = buf.readUInt16BE(hhea + 34);
  const hmtx = tables.get('hmtx').offset;
  const glyphOf = cmapFormat4(buf, tables.get('cmap').offset);
  const advanceOf = (glyph) => {
    const index = glyph < numberOfHMetrics ? glyph : numberOfHMetrics - 1;
    return buf.readUInt16BE(hmtx + index * 4);
  };
  return {
    file,
    unitsPerEm,
    ascender,
    descender,
    advance(text, size) {
      let em = 0;
      for (const char of text) em += advanceOf(glyphOf(char.codePointAt(0)));
      return em * size / unitsPerEm;
    },
  };
}

function cmapFormat4(buf, cmap) {
  const count = buf.readUInt16BE(cmap + 2);
  let format4 = 0;
  for (let i = 0; i < count; i++) {
    const platform = buf.readUInt16BE(cmap + 4 + i * 8);
    const encoding = buf.readUInt16BE(cmap + 6 + i * 8);
    const offset = buf.readUInt32BE(cmap + 8 + i * 8);
    const format = buf.readUInt16BE(cmap + offset);
    if (format === 4 && (format4 === 0 || (platform === 3 && encoding === 1))) format4 = cmap + offset;
  }
  if (!format4) throw new Error('Font has no Unicode cmap format 4 table');
  const segCount = buf.readUInt16BE(format4 + 6) / 2;
  const endCount = format4 + 14;
  const startCount = endCount + segCount * 2 + 2;
  const idDelta = startCount + segCount * 2;
  const idRangeOffset = idDelta + segCount * 2;
  return (code) => {
    for (let i = 0; i < segCount; i++) {
      const end = buf.readUInt16BE(endCount + i * 2);
      if (code > end) continue;
      const start = buf.readUInt16BE(startCount + i * 2);
      if (code < start) return 0;
      const range = buf.readUInt16BE(idRangeOffset + i * 2);
      const delta = buf.readInt16BE(idDelta + i * 2);
      if (range === 0) return (code + delta) & 0xffff;
      const glyph = buf.readUInt16BE(idRangeOffset + i * 2 + range + (code - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function create(w, h) {
  return {w, h, data: Buffer.alloc(w * h * 4)};
}

function fillSolid(img, color) {
  const [r, g, b, a] = color;
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
}

function blend(img, x, y, r, g, b, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  const data = img.data;
  if (a >= 255) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    return;
  }
  const inv = 255 - a;
  data[i] = (r * a + data[i] * inv + 127) >> 8;
  data[i + 1] = (g * a + data[i + 1] * inv + 127) >> 8;
  data[i + 2] = (b * a + data[i + 2] * inv + 127) >> 8;
  data[i + 3] = 255;
}

function blendSpan(img, left, right, y, color) {
  if (right <= left || y < 0 || y >= img.h) return;
  const [r, g, b, a] = color;
  const x0 = Math.max(0, Math.floor(left));
  const x1 = Math.min(img.w - 1, Math.ceil(right) - 1);
  for (let x = x0; x <= x1; x++) {
    const coverage = Math.min(x + 1, right) - Math.max(x, left);
    if (coverage > 0) blend(img, x, y, r, g, b, Math.min(255, Math.round(a * coverage)));
  }
}

function fillRoundRect(img, x, y, w, h, radius, color) {
  if (w <= 0 || h <= 0) return;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const y0 = Math.max(0, Math.floor(y));
  const y1 = Math.min(img.h, Math.ceil(y + h));
  for (let py = y0; py < y1; py++) {
    const cy = py + 0.5;
    if (cy < y || cy >= y + h) continue;
    let left = x;
    let right = x + w;
    if (cy < y + r || cy > y + h - r) {
      const center = cy < y + r ? y + r : y + h - r;
      const dy = cy - center;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      left = x + r - half;
      right = x + w - r + half;
    }
    blendSpan(img, left, right, py, color);
  }
}

function roundRect(img, x, y, w, h, radius, fill, stroke = null, sw = 1) {
  if (stroke) fillRoundRect(img, x, y, w, h, radius, stroke);
  if (fill) {
    const inset = stroke ? sw : 0;
    fillRoundRect(img, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(0, radius - inset), fill);
  }
}

function fillCircle(img, cx, cy, radius, color) {
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(img.h - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    const rest = radius * radius - dy * dy;
    if (rest <= 0) continue;
    const dx = Math.sqrt(rest);
    blendSpan(img, cx - dx, cx + dx, y, color);
  }
}

function frameBorder(img, color) {
  const [r, g, b, a] = color;
  for (let x = 0; x < img.w; x++) {
    blend(img, x, 0, r, g, b, a);
    blend(img, x, img.h - 1, r, g, b, a);
  }
  for (let y = 0; y < img.h; y++) {
    blend(img, 0, y, r, g, b, a);
    blend(img, img.w - 1, y, r, g, b, a);
  }
}

function blit(dst, src, dx, dy, clipW = src.w, alpha = 255) {
  dx = Math.round(dx);
  dy = Math.round(dy);
  if (alpha <= 0 || dx >= dst.w || dy >= dst.h) return;
  const width = Math.max(0, Math.min(src.w, Math.ceil(clipW), dst.w - dx));
  const height = Math.min(src.h, dst.h - dy);
  const x0 = Math.max(0, -dx);
  const y0 = Math.max(0, -dy);
  for (let y = y0; y < height; y++) {
    for (let x = x0; x < width; x++) {
      const si = (y * src.w + x) * 4;
      const sourceAlpha = src.data[si + 3];
      if (sourceAlpha === 0) continue;
      const pa = alpha === 255 ? sourceAlpha : Math.round(sourceAlpha * alpha / 255);
      blend(dst, dx + x, dy + y, src.data[si], src.data[si + 1], src.data[si + 2], pa);
    }
  }
}

// drawtext's y is the top of the glyph ink. The old layout put that top at
// y <= 0, so the first row of ascenders (t, d, l, h, b, accents) was clipped.
const lineMetricCache = new Map();
function lineMetrics(font, size) {
  const key = `${font.file}\0${size}`;
  const cached = lineMetricCache.get(key);
  if (cached) return cached;
  const stored = Math.round(size * 0.95);
  const ascenderPx = Math.round(font.ascender * size / font.unitsPerEm);
  const clippedRows = Math.max(0, -(stored - ascenderPx));
  const pad = Math.max(4, Math.ceil(size * 0.28));
  const descentPx = Math.ceil(Math.abs(font.descender) * size / font.unitsPerEm);
  const y = pad;
  const baseline = pad + clippedRows + stored;
  const height = baseline + descentPx + pad;
  const metrics = {y, baseline, height, originX: pad, pad};
  lineMetricCache.set(key, metrics);
  return metrics;
}

function inkBounds(img) {
  let minX = img.w;
  let minY = img.h;
  let maxX = -1;
  let maxY = -1;
  const data = img.data;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (data[(y * img.w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {minX, minY, maxX, maxY};
}

function assertGlyphInset(img, label) {
  const bounds = inkBounds(img);
  if (bounds.maxX < 0) throw new Error(`no pixels drawn for ${JSON.stringify(label)}`);
  const slack = {
    top: bounds.minY,
    bottom: img.h - 1 - bounds.maxY,
    left: bounds.minX,
    right: img.w - 1 - bounds.maxX,
  };
  if (slack.top < 2 || slack.bottom < 2 || slack.left < 2 || slack.right < 2) {
    throw new Error(`${JSON.stringify(label)} is flush with its bitmap (top ${slack.top}, bottom ${slack.bottom}, left ${slack.left}, right ${slack.right})`);
  }
  img.inkTop = bounds.minY;
  img.inkBottom = bounds.maxY;
  img.inkLeft = bounds.minX;
  img.inkRight = bounds.maxX;
}

function drawTextBitmap(text, font, size, color, tokens) {
  const metrics = lineMetrics(font, size);
  const advance = font.advance(text, size);
  const width = Math.max(8, Math.ceil(metrics.originX + advance + metrics.pad + size));
  const filters = [];
  if (tokens) {
    let x = metrics.originX;
    for (const token of tokens) {
      const file = join(scratch, `t${textSerial++}.txt`);
      writeFileSync(file, token.text);
      filters.push(`drawtext=fontfile=${font.file}:textfile=${file}:fontsize=${size}:fontcolor=${token.color}:x=${x.toFixed(2)}:y=${metrics.y}:expansion=none`);
      x += font.advance(token.text, size);
    }
  } else {
    const file = join(scratch, `t${textSerial++}.txt`);
    writeFileSync(file, text);
    filters.push(`drawtext=fontfile=${font.file}:textfile=${file}:fontsize=${size}:fontcolor=${color}:x=${metrics.originX}:y=${metrics.y}:expansion=none`);
  }
  const drawn = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=black@0.0:s=${width}x${metrics.height}:r=1,format=rgba`,
    '-vf', filters.join(','),
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], {maxBuffer: width * metrics.height * 4 + 65536});
  if (drawn.status !== 0) throw new Error(drawn.stderr.toString() || `ffmpeg could not draw ${JSON.stringify(text)}`);
  if (drawn.stdout.length !== width * metrics.height * 4) {
    throw new Error(`Expected ${width * metrics.height * 4} bytes for ${JSON.stringify(text)}, got ${drawn.stdout.length}`);
  }
  const img = {
    w: width,
    h: metrics.height,
    data: drawn.stdout,
    advance,
    baseline: metrics.baseline,
    originX: metrics.originX,
    label: text,
  };
  assertGlyphInset(img, text);
  return img;
}

function renderText(text, font, size, color) {
  return drawTextBitmap(text, font, size, color, null);
}

// Place the pen at penX and the alphabetic baseline at baselineY.
// clipAdvance limits a typewriter line to that many pixels of glyph advance.
function place(img, bitmap, penX, baselineY, clipAdvance = null, alpha = 255) {
  const dx = Math.round(penX - bitmap.originX);
  const dy = Math.round(baselineY - bitmap.baseline);
  const clipW = clipAdvance == null ? bitmap.w : Math.ceil(bitmap.originX + clipAdvance);
  if (alpha > 0 && clipW > bitmap.inkLeft) {
    const top = dy + bitmap.inkTop;
    const bottom = dy + bitmap.inkBottom;
    const left = dx + bitmap.inkLeft;
    const right = dx + Math.min(bitmap.inkRight, clipW - 1);
    if (top < 1 || left < 1 || bottom > img.h - 2 || right > img.w - 2) {
      throw new Error(`"${bitmap.label}" escapes the canvas (top ${top}, bottom ${bottom}, left ${left}, right ${right})`);
    }
  }
  blit(img, bitmap, dx, dy, clipW, alpha);
}

function tokenize(line) {
  const keywords = new Set(['await', 'const', 'let']);
  const methods = new Set(['getState', 'getApp', 'getAXStateAndScreenshot', 'click']);
  const names = new Set(['cua', 'app', 'state', 'pid', 'windowId']);
  const tokens = [];
  const expression = /await|const|let|\d+|[A-Za-z_][A-Za-z0-9_]*|[{}()[\],.;]|./g;
  let index = 0;
  for (const match of line.matchAll(expression)) {
    if (match.index !== index) throw new Error(`Tokenizer skipped "${line.slice(index, match.index)}" in ${line}`);
    const text = match[0];
    let color = '0xd7e2e6';
    if (keywords.has(text)) color = '0x8fd9cf';
    else if (methods.has(text)) color = '0xf0d089';
    else if (names.has(text)) color = '0xf7fbfb';
    else if (/^\d+$/.test(text)) color = '0xf0b08a';
    else if ('{}()[],.;'.includes(text)) color = '0x9aafb6';
    tokens.push({text, color});
    index += text.length;
  }
  if (index !== line.length) throw new Error(`Tokenizer stopped early in ${line}`);
  if (tokens.map((token) => token.text).join('') !== line) throw new Error(`Tokenizer changed ${line}`);
  return tokens;
}

function renderCodeLine(line, font, size) {
  return drawTextBitmap(line, font, size, '0xffffff', tokenize(line));
}

function stops(font, size, text) {
  const points = [0];
  let width = 0;
  for (const char of text) {
    width += font.advance(char, size);
    points.push(width);
  }
  return points;
}

function buildTimeline() {
  const frames = [];
  const push = (count, spec) => {
    for (let i = 0; i < count; i++) frames.push({...spec, holdIndex: i});
  };
  const typedFrame = (typed) => ({typed: [...typed], typing: false, holdIndex: 0});

  // Call 1. Bindings appear only after the declaration has been fully typed.
  const scene1 = {tool: 'js', step: 0, label: 'call 1', lines: CALL_1, reset: false};
  push(4, {...scene1, ...typedFrame([0, 0]), chips: [], status: ['Nothing bound yet']});
  typeInto(frames, scene1, [0, 0], 0, [], ['Nothing bound yet']);
  push(6, {...scene1, ...typedFrame([CALL_1[0].length, 0]), chips: [{name: 'state', alpha: 1}], status: ['state is bound']});
  typeInto(frames, scene1, [CALL_1[0].length, 0], 1, [{name: 'state', alpha: 1}], ['state is bound']);
  push(2, {...scene1, ...typedFrame([CALL_1[0].length, CALL_1[1].length]), chips: [{name: 'state', alpha: 1}, {name: 'app', alpha: 0.5}], status: ['Kept for the next js call']});
  push(12, {...scene1, ...typedFrame([CALL_1[0].length, CALL_1[1].length]), chips: [{name: 'state', alpha: 1}, {name: 'app', alpha: 1}], status: ['Kept for the next js call'], preview: 'call-1'});

  // Call 2 starts with the same bindings. `app` is reused, not recreated.
  const scene2 = {tool: 'js', step: 1, label: 'call 2 · same session', lines: CALL_2, reset: false};
  const kept = [{name: 'state', alpha: 1}, {name: 'app', alpha: 1, reused: true}];
  push(4, {...scene2, ...typedFrame([0, 0]), chips: kept, status: ['Same app object as call 1']});
  typeInto(frames, scene2, [0, 0], 0, kept, ['Same app object as call 1']);
  push(2, {...scene2, ...typedFrame([CALL_2[0].length, 0]), chips: kept, status: ['Same app object as call 1']});
  typeInto(frames, scene2, [CALL_2[0].length, 0], 1, kept, ['Same app object as call 1']);
  push(14, {...scene2, ...typedFrame([CALL_2[0].length, CALL_2[1].length]), chips: kept, status: ['Same app object as call 1'], preview: 'call-2'});

  // js_reset is its own MCP tool. It is not JavaScript in the REPL.
  const scene3 = {tool: 'js_reset', step: 2, label: 'clears bindings', lines: [], reset: true};
  for (let step = 0; step < 6; step++) {
    const alpha = 1 - (step + 1) / 6;
    frames.push({...scene3, typed: [], chips: [{name: 'state', alpha}, {name: 'app', alpha}], status: ['Clearing bindings'], holdIndex: step, typing: false});
  }
  push(14, {...scene3, typed: [], chips: [], status: ['Cleared.', 'The next js call starts over.'], preview: 'reset'});
  return frames;

  function typeInto(target, scene, base, lineIndex, chips = null, status = null) {
    const length = scene.lines[lineIndex].length;
    for (let count = 3; count < length; count += 3) {
      const typed = [...base];
      typed[lineIndex] = count;
      target.push({
        ...scene,
        typed,
        typing: true,
        holdIndex: 0,
        chips: chips ?? chipsFor(scene, base),
        status: status ?? statusFor(scene, base),
      });
    }
    const typed = [...base];
    typed[lineIndex] = length;
    target.push({
      ...scene,
      typed,
      typing: true,
      holdIndex: 0,
      chips: chips ?? chipsFor(scene, base),
      status: status ?? statusFor(scene, base),
    });
  }
  function chipsFor(scene, typed) {
    if (scene.step !== 0) return [];
    const chips = [];
    if (typed[0] >= CALL_1[0].length) chips.push({name: 'state', alpha: 1});
    return chips;
  }
  function statusFor(scene, typed) {
    if (typed[0] >= CALL_1[0].length) return ['state is bound'];
    return ['Nothing bound yet'];
  }
}

function drawPill(img, x, y, w, h, fill, stroke, label) {
  roundRect(img, x, y, w, h, 8, fill, stroke, 1);
  place(img, label, x + (w - label.advance) / 2, y + h / 2 + 1);
}

function compose(fonts) {
  const mono = fonts.mono;
  const sans = fonts.sans;
  const sansBold = fonts.sansBold;
  const codeSize = 20;
  const codeLines = Object.fromEntries([...CALL_1, ...CALL_2].map((line) => [line, renderCodeLine(line, mono, codeSize)]));
  const lineStops = Object.fromEntries([...CALL_1, ...CALL_2].map((line) => [line, stops(mono, codeSize, line)]));
  for (const line of [...CALL_1, ...CALL_2]) {
    const inner = 640 - 56;
    if (codeLines[line].advance > inner) throw new Error(`Code line is wider than the panel: ${line}`);
  }

  const ui = {
    title: renderText('Persistent session', sansBold, 26, '0x1a2b30'),
    subtitle: renderText('API illustration · js calls share one REPL', sans, 15, '0x5d7178'),
    footer: renderText('Placeholders only: pid, windowId, and index 7. No app output and no desktop capture.', sans, 14, '0x3e555c'),
    toolLabel: renderText('MCP tool', sans, 13, '0x8aa0a6'),
    schematic: renderText('schematic', sansBold, 12, '0x0f766e'),
    bindingsTitle: renderText('Session bindings', sansBold, 18, '0x1a2b30'),
    reused: renderText('reused', sansBold, 13, '0x0f766e'),
    arguments: renderText('arguments', sans, 14, '0x9aafb6'),
    emptyArgs: renderText('{}', mono, 28, '0xf7fbfb'),
    call1: renderText('call 1', sans, 14, '0xc9d7dc'),
    call2: renderText('call 2 · same session', sans, 14, '0xc9d7dc'),
    call3: renderText('clears bindings', sans, 14, '0xf0d7bf'),
    js: renderText('js', sansBold, 14, '0xf4fffc'),
    reset: renderText('js_reset', sansBold, 14, '0xfff8f2'),
    state: renderText('state', mono, 15, '0x1a2b30'),
    app: renderText('app', mono, 15, '0x1a2b30'),
    stepJs: renderText('js', sansBold, 14, '0xffffff'),
    stepJsIdle: renderText('js', sansBold, 14, '0x5d7178'),
    stepReset: renderText('js_reset', sansBold, 14, '0xffffff'),
    stepResetIdle: renderText('js_reset', sansBold, 14, '0x5d7178'),
    nums: [1, 2, 3].map((n) => ({
      on: renderText(String(n), sansBold, 14, '0xffffff'),
      off: renderText(String(n), sansBold, 14, '0x5d7178'),
    })),
  };
  const statuses = {
    'Nothing bound yet': [renderText('Nothing bound yet', sans, 14, '0x5d7178')],
    'state is bound': [renderText('state is bound', sans, 14, '0x5d7178')],
    'Kept for the next js call': [renderText('Kept for the next js call', sans, 14, '0x1a2b30')],
    'Same app object as call 1': [renderText('Same app object as call 1', sans, 14, '0x1a2b30')],
    'Clearing bindings': [renderText('Clearing bindings', sans, 14, '0x8a4e16')],
    'Cleared.': [renderText('Cleared.', sansBold, 14, '0x8a4e16')],
    'The next js call starts over.': [renderText('The next js call starts over.', sans, 14, '0x5d7178')],
  };

  const codeX = 28;
  const codeY = 86;
  const codeW = 640;
  const codeH = 360;
  const bindX = 684;
  const bindW = 248;
  const base = create(GIF_W, GIF_H);
  fillSolid(base, paper);
  frameBorder(base, edge);
  place(base, ui.title, 28, 46);
  place(base, ui.subtitle, 28, 74);
  roundRect(base, codeX, codeY, codeW, codeH, 14, codeBg);
  roundRect(base, codeX, codeY, codeW, 52, 14, codeHeader);
  fillRoundRect(base, codeX, codeY + 32, codeW, 20, 0, codeHeader);
  roundRect(base, bindX, codeY, bindW, codeH, 14, white, line, 1);
  place(base, ui.schematic, bindX + 18, codeY + 28);
  place(base, ui.bindingsTitle, bindX + 18, codeY + 54);
  place(base, ui.toolLabel, codeX + 18, codeY + 26);
  place(base, ui.footer, 28, 528);

  const chipX = codeX + 18 + ui.toolLabel.advance + 12;
  const labels = { 'call 1': ui.call1, 'call 2 · same session': ui.call2, 'clears bindings': ui.call3 };
  const frames = buildTimeline();
  console.log(`Drawing ${frames.length} frames at ${GIF_W}×${GIF_H}`);
  const rawPath = join(scratch, 'frames.raw');
  const raw = openSync(rawPath, 'w');
  const previews = [];
  try {
    frames.forEach((frame, index) => {
      const img = {w: base.w, h: base.h, data: Buffer.from(base.data)};
      const toolText = frame.tool === 'js' ? ui.js : ui.reset;
      const toolFill = frame.tool === 'js' ? teal : amber;
      const toolW = Math.ceil(toolText.advance + 22);
      roundRect(img, chipX, codeY + 13, toolW, 26, 7, toolFill);
      place(img, toolText, chipX + 11, codeY + 26);
      const sceneLabel = labels[frame.label];
      place(img, sceneLabel, codeX + codeW - 18 - sceneLabel.advance, codeY + 26);

      if (frame.reset) {
        place(img, ui.arguments, codeX + (codeW - ui.arguments.advance) / 2, codeY + 168);
        place(img, ui.emptyArgs, codeX + (codeW - ui.emptyArgs.advance) / 2, codeY + 214);
      } else {
        const bodyTop = codeY + 52;
        const bodyH = codeH - 52;
        const gap = 40;
        const firstBaseline = bodyTop + (bodyH - gap) / 2;
        frame.lines.forEach((line, lineIndex) => {
          const shown = frame.typed[lineIndex] ?? 0;
          if (shown <= 0 && !(lineIndex === 0 && frame.typed.every((count) => count === 0))) return;
          const bitmap = codeLines[line];
          const clip = lineStops[line][Math.min(shown, line.length)];
          const baseline = firstBaseline + lineIndex * gap;
          place(img, bitmap, codeX + 28, baseline, shown <= 0 ? 0 : clip + 1);
          const caretOn = frame.typing || frame.holdIndex % 8 < 5;
          const caretLine = (frame.typed[1] ?? 0) > 0 ? 1 : 0;
          if (caretOn && lineIndex === caretLine) {
            const caretX = Math.round(codeX + 28 + (lineStops[line][Math.min(frame.typed[lineIndex] ?? 0, line.length)] ?? 0));
            fillRoundRect(img, caretX, baseline - 16, 2, 20, 1, hex('#8fd9cf'));
          }
        });
      }

      let chipY = codeY + 78;
      for (const chip of frame.chips) {
        const glyph = chip.name === 'state' ? ui.state : ui.app;
        const chipW = Math.ceil(glyph.advance + 22);
        const fill = chip.name === 'app' && chip.reused ? tealSoft : white;
        const stroke = chip.name === 'app' && chip.reused ? teal : line;
        roundRect(img, bindX + 18, chipY, chipW, 30, 8, fill, stroke, 1);
        place(img, glyph, bindX + 29, chipY + 17, null, Math.round(chip.alpha * 255));
        if (chip.reused) place(img, ui.reused, bindX + 18 + chipW + 8, chipY + 17, null, Math.round(chip.alpha * 255));
        chipY += 40;
      }
      const statusBitmaps = frame.status.flatMap((item) => statuses[item]);
      statusBitmaps.forEach((bitmap, statusIndex) => {
        place(img, bitmap, bindX + 18, codeY + codeH - 28 - (statusBitmaps.length - 1 - statusIndex) * 22);
      });

      const steps = [
        {n: '1', label: frame.step === 0 ? ui.stepJs : ui.stepJsIdle, num: frame.step === 0 ? ui.nums[0].on : ui.nums[0].off, on: frame.step === 0, warn: false},
        {n: '2', label: frame.step === 1 ? ui.stepJs : ui.stepJsIdle, num: frame.step === 1 ? ui.nums[1].on : ui.nums[1].off, on: frame.step === 1, warn: false},
        {n: '3', label: frame.step === 2 ? ui.stepReset : ui.stepResetIdle, num: frame.step === 2 ? ui.nums[2].on : ui.nums[2].off, on: frame.step === 2, warn: true},
      ];
      let stepX = 28;
      for (const step of steps) {
        const w = Math.ceil(step.num.advance + step.label.advance + 28);
        const fill = step.on ? (step.warn ? amber : teal) : white;
        const stroke = step.on ? null : line;
        roundRect(img, stepX, 474, w, 30, 8, fill, stroke, 1);
        place(img, step.num, stepX + 12, 489);
        place(img, step.label, stepX + 12 + step.num.advance + 8, 489);
        stepX += w + 10;
      }

      writeSync(raw, img.data);
      if (frame.preview) previews.push({name: frame.preview, data: img.data});
      if (index % 20 === 0) console.log(`  frame ${index + 1}/${frames.length}`);
    });
  } finally {
    closeSync(raw);
  }
  return {rawPath, frames: frames.length, previews};
}

function renderSocial(fonts) {
  const W = 1280;
  const H = 640;
  const img = create(W, H);
  fillSolid(img, hex('#102326'));
  fillCircle(img, 1110, 120, 280, hex('#17383a'));
  fillCircle(img, 1180, 520, 240, hex('#143234'));
  fillRoundRect(img, 0, 0, 8, H, 0, hex('#1f8f86'));
  const title = renderText('macOS Computer Use MCP', fonts.sansBold, 58, '0xf4fbf9');
  const line1 = renderText('Script macOS apps from a persistent JavaScript session —', fonts.sans, 26, '0xd5e4e1');
  const line2 = renderText('through just two MCP tools.', fonts.sans, 26, '0xd5e4e1');
  const eyebrow = renderText('Independent local MCP', fonts.sansBold, 16, '0x8fd9cf');
  const note = renderText('Two public tools, one persistent Node.js REPL, and a Swift helper.', fonts.sans, 18, '0x8eada9');
  if (title.advance > 1100) throw new Error('Social title is wider than the banner');
  if (line1.advance > 1100) throw new Error('Social tagline is wider than the banner');
  const x = 76;
  place(img, eyebrow, x, 188);
  fillRoundRect(img, x, 210, 56, 3, 1.5, hex('#1f8f86'));
  place(img, title, x, 292);
  place(img, line1, x, 360);
  place(img, line2, x, 398);
  const chips = [
    ['js', fonts.sansBold, hex('#143f3c'), '0xd7f5f1'],
    ['js_reset', fonts.sansBold, hex('#3d3128'), '0xf3ddc4'],
    ['persistent REPL', fonts.sansBold, hex('#16343c'), '0xd5e4e1'],
  ];
  let chipX = x;
  for (const [label, font, fill, color] of chips) {
    const glyph = renderText(label, font, 18, color);
    const w = Math.ceil(glyph.advance + 28);
    roundRect(img, chipX, 436, w, 40, 10, fill);
    place(img, glyph, chipX + 14, 456);
    chipX += w + 12;
  }
  place(img, note, x, 530);
  return img;
}

function writeRawPng(raw, width, height, dest) {
  const encoded = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-i', 'pipe:0',
    '-frames:v', '1', '-compression_level', '9', dest,
  ], {input: raw, maxBuffer: 1024});
  if (encoded.status !== 0) throw new Error(encoded.stderr.toString() || `could not write ${dest}`);
}

function writeGif(rawPath, dest, frames) {
  const encoded = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${GIF_W}x${GIF_H}`, '-r', String(FPS), '-i', rawPath,
    '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=80:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
    '-loop', '0', dest,
  ], {maxBuffer: 1024 * 1024});
  if (encoded.status !== 0) throw new Error(encoded.stderr.toString() || 'gif encode failed');
  console.log(`${dest} ${statSync(dest).size} bytes, ${frames} frames`);
}

const previewDir = process.argv.includes('--preview') ? process.argv[process.argv.indexOf('--preview') + 1] : '';
const fonts = {
  mono: loadFont(findFont([
    '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
    '/Library/Fonts/JetBrainsMono-Regular.ttf',
  ])),
  sans: loadFont(findFont([
    '/usr/share/fonts/truetype/macos/Inter-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ])),
  sansBold: loadFont(findFont([
    '/usr/share/fonts/truetype/macos/Inter-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ])),
};

try {
  mkdirSync(assetDir, {recursive: true});
  console.log(`Fonts: ${fonts.mono.file}`);
  // Accents have to clear the bitmap edge, and a CJK probe checks a full em box.
  for (const font of [fonts.mono, fonts.sans, fonts.sansBold]) renderText('HÁbdfhklt', font, 22, '0xffffff');
  renderText('永中', loadFont('/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf'), 28, '0xffffff');
  const social = renderSocial(fonts);
  const socialPath = join(assetDir, 'social-preview.png');
  writeRawPng(social.data, social.w, social.h, socialPath);
  console.log(`${socialPath} ${statSync(socialPath).size} bytes`);
  const animation = compose(fonts);
  const gifPath = join(assetDir, 'session-illustration.gif');
  writeGif(animation.rawPath, gifPath, animation.frames);
  if (statSync(gifPath).size > 1.5 * 1024 * 1024) throw new Error('GIF exceeds 1.5 MB');
  if (previewDir) {
    mkdirSync(previewDir, {recursive: true});
    for (const preview of animation.previews) writeRawPng(preview.data, GIF_W, GIF_H, join(previewDir, `${preview.name}.png`));
    writeRawPng(social.data, social.w, social.h, join(previewDir, 'social-preview.png'));
  }
} finally {
  rmSync(scratch, {recursive: true, force: true});
}
