import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {verticalGaps} from '../scripts/render-readme-visuals.mjs';

test('readme figures are original, small, and linked from both languages', () => {
  const gif = readFileSync('docs/assets/session-illustration.gif');
  const png = readFileSync('docs/assets/social-preview.png');
  const svg = readFileSync('docs/assets/architecture.svg', 'utf8');
  assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
  assert.equal(gif.readUInt16LE(6), 960);
  assert.equal(gif.readUInt16LE(8), 544);
  assert.ok(gif.length < 1.5 * 1024 * 1024, `gif is ${gif.length} bytes`);
  let frames = 0;
  for (let i = 0; i < gif.length - 1; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xF9) frames++;
  assert.ok(frames >= 24, `expected an animation, saw ${frames} frames`);
  assert.equal(png.readUInt32BE(16), 1280);
  assert.equal(png.readUInt32BE(20), 640);
  assert.ok(statSync('docs/assets/social-preview.png').size < 400 * 1024);
  for (const phrase of ['js_reset', 'AXUIElement', 'AXPress', 'ScreenCaptureKit', 'Vision', 'NDJSON']) {
    assert.match(svg, new RegExp(phrase));
  }
  assert.doesNotMatch(svg, /<script|foreignObject|<image|\bhref=/i);
  const english = readFileSync('README.md', 'utf8');
  const chinese = readFileSync('docs/zh-CN/README.md', 'utf8');
  assert.match(english, /docs\/assets\/architecture\.svg/);
  assert.match(english, /docs\/assets\/session-illustration\.gif/);
  assert.match(english, /not a screen recording/);
  assert.match(chinese, /\.\.\/assets\/architecture\.svg/);
  assert.match(chinese, /\.\.\/assets\/session-illustration\.gif/);
  assert.match(chinese, /不是屏幕录制/);
  const demo = readFileSync('docs/assets/demo.gif');
  assert.equal(demo.subarray(0, 6).toString(), 'GIF89a');
  const demoWidth = demo.readUInt16LE(6);
  const demoHeight = demo.readUInt16LE(8);
  assert.ok(demoWidth >= 800 && demoWidth <= 960, `demo width ${demoWidth}`);
  assert.ok(demoHeight >= 500 && demoHeight <= 800, `demo height ${demoHeight}`);
  assert.ok(demo.length < 3 * 1024 * 1024, `demo gif is ${demo.length} bytes`);
  let demoFrames = 0;
  for (let i = 0; i < demo.length - 1; i++) if (demo[i] === 0x21 && demo[i + 1] === 0xF9) demoFrames++;
  assert.ok(demoFrames >= 96, `expected a real-time demo, saw ${demoFrames} frames`);
  assert.match(english, /docs\/assets\/demo\.gif/);
  assert.match(english, /Ledger Lantern Mail/);
  assert.match(chinese, /\.\.\/assets\/demo\.gif/);
  assert.match(chinese, /Ledger Lantern Mail/);
});

test('boxed labels split the leftover space so the gaps differ by at most one pixel', () => {
  for (const box of [26, 28, 30, 40, 52, 308]) {
    for (const ink of [8, 9, 11, 14, 16, 21]) {
      if (ink > box) continue;
      const {gapTop, gapBottom} = verticalGaps(box, ink);
      assert.ok(Math.abs(gapTop - gapBottom) <= 1, `${box} vs ${ink}: ${gapTop}/${gapBottom}`);
      assert.equal(gapTop + gapBottom + ink, box);
      assert.ok(gapTop >= 0 && gapBottom >= 0);
    }
  }
});
