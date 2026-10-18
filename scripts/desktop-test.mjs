import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Bridge } from '../src/bridge.mjs';
import { startFixture, fixtureBundleId } from './fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if(process.env.CU_TEST_ALLOW_FOREGROUND_SETUP!=='1')throw Error('Foreground regression activates windows and moves the pointer. Set CU_TEST_ALLOW_FOREGROUND_SETUP=1 explicitly.');
const fixture = await startFixture();
const client = new Client({ name: 'desktop-acceptance', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], cwd: root, env: { ...process.env, CU_ENABLE_FOREGROUND:'1', CU_ALLOWED_BUNDLE_IDS: fixtureBundleId } });
const checks = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
let target;
async function call(name, args = {}, expectedError) {
  if (['cu_click','cu_type_text','cu_key','cu_scroll','cu_drag','cu_ax_action','cu_select_text'].includes(name)) args={...args,mode:'foreground'};
  const result = await client.callTool({ name, arguments: args });
  const text = result.content.find(c => c.type === 'text')?.text;
  const value = text ? JSON.parse(text) : result.structuredContent;
  if (expectedError) { assert.equal(result.isError, true, `${name} should fail`); assert.equal(value.error.code, expectedError); }
  else assert.ok(!result.isError, `${name}: ${text}`);
  return { result, value };
}
function check(name) { checks.push(name); console.log(`PASS ${name}`); }
try {
  await client.connect(transport);
  const catalog = await client.listTools(); assert.equal(catalog.tools.length, 17); check('MCP stdio initialize + tools/list (17 tools)');
  const { value: status } = await call('cu_status');
  assert.equal(status.permissions.accessibility, true); assert.equal(status.permissions.screenRecording, true); check('TCC granted in current execution context');
  let windows;
  for (let i = 0; i < 40; i++) {
    windows = (await call('cu_windows', { pid: fixture.pid })).value.windows;
    if (windows.length) break;
    await pause(50);
  }
  const w = windows.find(w => w.title === 'Computer Use Test Fixture') ?? windows[0];
  assert.ok(w); target = { pid: fixture.pid, windowId: w.windowId }; check('real app/window enumeration');
  const first = await call('cu_snapshot', { ...target });
  const snap = first.value;
  assert.equal(snap.truncated, false);
  const image = first.result.content.find(c => c.type === 'image');
  assert.ok(image); assert.ok(Buffer.from(image.data, 'base64').subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../artifacts/fixture-before.png', import.meta.url), Buffer.from(image.data, 'base64'));
  writeFileSync(new URL('../artifacts/fixture-snapshot.json', import.meta.url), JSON.stringify(snap, null, 2));
  check('ScreenCaptureKit PNG + AX snapshot with image scale metadata');
  const field = snap.nodes.find(n => n.identifier === 'message-input');
  const button = snap.nodes.find(n => n.identifier === 'apply-message');
  const secure = snap.nodes.find(n => n.identifier === 'secure-input');
  assert.ok(field); assert.ok(button); assert.ok(secure); assert.equal(secure.value, undefined); assert.equal(secure.secure, true); check('secure field redaction');
  await call('cu_ax_action', { snapshotId: snap.snapshotId, elementId: field.id, action: 'focus' });
  await call('cu_type_text', { ...target, text: 'Hello 中文 🧪' }); await pause(150);
  assert.equal(fixture.state().input, 'Hello 中文 🧪'); check('Unicode typing into actual AppKit field');
  await call('cu_key', { ...target, key: 'CMD+A' });
  await call('cu_type_text', { ...target, text: 'Verified by MCP' }); await pause(150);
  assert.equal(fixture.state().input, 'Verified by MCP'); check('keyboard chord and replacement');
  await call('cu_ax_action', { snapshotId: snap.snapshotId, elementId: button.id, action: 'press' }); await pause(150);
  assert.equal(fixture.state().count, 1); assert.ok(fixture.state().result.includes('Verified by MCP')); check('AX semantic press');
  await call('cu_click', { snapshotId: snap.snapshotId, elementId: button.id }); await pause(150);
  assert.equal(fixture.state().count, 2); check('element-targeted CGEvent click');
  const bf = button.frame;
  await call('cu_click', { ...target, x: bf.x+bf.width/2, y: bf.y+bf.height/2 }); await pause(150);
  assert.equal(fixture.state().count, 3); check('window-relative coordinate CGEvent click');
  await call('cu_ax_action', { snapshotId: snap.snapshotId, elementId: field.id, action: 'setValue', value: 'AX replacement' });
  await call('cu_ax_action', { snapshotId: snap.snapshotId, elementId: button.id, action: 'press' }); await pause(100);
  assert.ok(fixture.state().result.includes('AX replacement')); check('AX setValue');
  await call('cu_drag', { ...target, fromX: 70, fromY: 300, toX: 360, toY: 300, duration: 0.25 }); await pause(100);
  assert.ok(fixture.state().drags > 0); check('real mouse drag events');
  await call('cu_scroll', { ...target, x: 150, y: 300, deltaY: -150 }); await pause(100);
  assert.ok(fixture.state().scrolls > 0); check('real scroll events');
  const { value: ocr } = await call('cu_ocr', target);
  assert.ok(ocr.lines.some(l => /Apply message/i.test(l.text))); check('local Vision OCR');
  await call('cu_click', { ...target, x: 9999, y: 10 }, 'POINT_OUTSIDE_WINDOW');
  await call('cu_ax_action', { snapshotId: snap.snapshotId, elementId: 'e9999', action: 'press' }, 'STALE_ELEMENT');
  await call('cu_ax_action', { snapshotId: snap.snapshotId, elementId: secure.id, action: 'setValue', value: 'blocked' }, 'SECURE_INPUT');
  await call('cu_ax_action', { snapshotId: snap.snapshotId, elementId: secure.id, action: 'focus' }, 'SECURE_INPUT');
  await call('cu_clipboard', {}, 'CLIPBOARD_DISABLED');
  await call('cu_screenshot', {}, 'DESKTOP_CAPTURE_DISABLED');
  await call('cu_launch', { bundleId: 'com.apple.TextEdit' }, 'APP_NOT_ALLOWED');
  check('out-of-bounds, stale ID, secure input, clipboard and app-policy rejections');
  const after = await call('cu_snapshot', target);
  writeFileSync(new URL('../artifacts/fixture-after.png', import.meta.url), Buffer.from(after.result.content.find(c => c.type === 'image').data, 'base64'));
  const native = new Bridge({ env: { ...process.env, CU_ENABLE_FOREGROUND:'1', CU_ALLOWED_BUNDLE_IDS: '' } });
  try { assert.equal((await native.request('apps')).apps.length, 0); await assert.rejects(native.request('snapshot', target), { code: 'APP_NOT_ALLOWED' }); }
  finally { native.close(); }
  check('empty app allowlist fails closed');
  const cancellable = new Bridge({ env: { ...process.env, CU_ENABLE_FOREGROUND:'1', CU_ALLOWED_BUNDLE_IDS: fixtureBundleId } });
  try {
    await cancellable.request('status');
    const previous = fixture.state().releases;
    const controller = new AbortController();
    const drag = cancellable.request('drag', { ...target, mode:'foreground', fromX: 60, fromY: 300, toX: 400, toY: 300, duration: 2 }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 350);
    await assert.rejects(drag, { code: 'CANCELLED' });
    await cancellable.request('status'); await pause(100);
    assert.ok(fixture.state().releases > previous, 'SIGTERM must release held mouse button');
  } finally { cancellable.close(); }
  check('cancelling active drag releases mouse button before fresh helper session');
  const { value: partial } = await call('cu_snapshot', { ...target, screenshot: false, maxNodes: 1 });
  assert.equal(partial.nodes.length, 1); assert.equal(partial.truncated, true); check('bounded AX snapshots report incomplete coverage');
  const { value: selectionSnapshot } = await call('cu_snapshot', { ...target, screenshot: false, includeMenuBar: true });
  const selectedField = selectionSnapshot.nodes.find(n => n.identifier === 'message-input');
  assert.ok(selectionSnapshot.nodes.some(n => n.scope === 'menu' && n.role === 'AXMenuBar')); check('optional application menu bar perception');
  await call('cu_ax_action', { snapshotId: selectionSnapshot.snapshotId, elementId: selectedField.id, action: 'setValue', value: 'left 中文 right 中文' });
  await call('cu_select_text', { snapshotId: selectionSnapshot.snapshotId, elementId: selectedField.id, text: '中文' }, 'AMBIGUOUS_TEXT');
  const selected = await call('cu_select_text', { snapshotId: selectionSnapshot.snapshotId, elementId: selectedField.id, text: '中文', prefix: 'left ' });
  assert.deepEqual(selected.value.utf16Range, { location: 5, length: 2 });
  await call('cu_type_text', { ...target, text: 'selection' });
  assert.equal(fixture.state().input, 'left selection right 中文'); check('UTF-16 selection disambiguation and replacement');
  assert.equal(selectionSnapshot.nodes.some(n => n.scope === 'menu' && n.title === 'Apple'), false);
  const selectAllMenu = selectionSnapshot.nodes.find(n => n.scope === 'menu' && n.title === 'Select All');
  assert.ok(selectAllMenu);
  await call('cu_ax_action', { snapshotId: selectionSnapshot.snapshotId, elementId: selectAllMenu.id, action: 'press' });
  await call('cu_type_text', { ...target, text: 'Menu verified' });
  assert.equal(fixture.state().input, 'Menu verified'); check('semantic app-menu action with system Apple menu excluded');
  const report = { date: new Date().toISOString(), platform: status.osVersion, node: process.version, backend: status.backend, permissions: status.permissions, checks, finalFixtureState: fixture.state(), toolCount: catalog.tools.length, limitations: ['Current launch context inherits normal macOS authorization; a separately launched terminal/agent must obtain its own TCC approval.', 'Only controlled AppKit fixture exercised; cross-app/browser behavior is not asserted.'] };
  writeFileSync(new URL('../artifacts/desktop-test-report.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(`Verified ${checks.length} desktop acceptance checks.`);
} finally {
  await client.close(); fixture.close();
}
