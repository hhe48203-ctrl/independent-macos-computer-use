import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuiValidator} from '../scripts/bench-v2/guard.mjs';
import {createScopedRequest} from '../scripts/bench-v2/mcp.mjs';

test('benchmark JS allows ordinary REPL actions and filters out process, network and filesystem access', () => {
  const validate = createGuiValidator();
  validate('let app = await cua.getApp({pid: 123, windowId: 7});');
  validate('await app.click(4); await app.getAXStateAndScreenshot();');
  validate('await app.hover([15, 25], {durationMs:1500, screenshot:true});');
  validate('const shown = (await cua.listWindows()).filter(w => w.onScreen);');
  validate('const update = await app.setValue(5, "sample"); nodeRepl.write(update.valueVerified);');
  validate('await (async () => {const s = await app.getAXState({emit:false}); nodeRepl.write(s.split("\\n").filter(line => line.includes("Button")));})();');
  validate('const edits = [[5, "sample"]]; for (const edit of edits) { await app.setValue(edit[0], edit[1]); }');
  validate('nodeRepl.write(RegExp("A1").test("A1"));');
  assert.throws(() => validate('new RegExp("A1")'), {code:'BENCH_JS_SUBSET'});
  assert.throws(() => validate('for (const [index, value] of edits) { await app.setValue(index, value); }'), {code:'BENCH_JS_SUBSET'});
  for (const code of [
    'await import("node:fs")', 'require("child_process")', 'nodeRepl.env', 'process.env',
    'cua.launchApp("com.apple.Terminal")', 'app["constructor"]', 'const a = () => 1; a.constructor("return process")()',
    'const a = {}; a.__proto__ = cua', 'eval("1")', 'fetch("https://example.org")',
  ]) assert.throws(() => validate(code), {code:'BENCH_GUI_ONLY'}, code);
  assert.throws(() => validate('await unpublished.getAXState()'), {code:'BENCH_JS_SUBSET'});
});

test('benchmark scope limits observations and mutations to owned PIDs and snapshots', async () => {
  const calls = [];
  const request = createScopedRequest(async (method, params) => {
    calls.push([method, params]);
    if (method === 'windows') return {windows:[{pid:42}, {pid:77}]};
    if (method === 'snapshot') return {snapshotId:'observed'};
    return {ok:true};
  }, [{pid:42,bundleId:'ai.cua.benchlab'}]);
  assert.deepEqual(await request('windows'), {windows:[{pid:42}]});
  await request('snapshot', {pid:42,windowId:8});
  await request('click', {snapshotId:'observed',elementId:'e1'});
  await request('drag', {pid:42,windowId:8});
  for (const [method,params] of [
    ['click',{pid:77,windowId:9}], ['screenshot',{}], ['ax_action',{snapshotId:'unobserved'}],
    ['launch',{bundleId:'com.apple.Terminal'}], ['request_permissions',{}],
    ['key',{pid:42,windowId:8,key:'CMD+V'}], ['click',{pid:42,windowId:8,mode:'foreground'}],
  ]) await assert.rejects(request(method,params), {code:'BENCH_GUI_ONLY'});
  assert.equal(calls.length, 4);
});

test('benchmark permits explicit real hover only in a foreground trial on an owned window', async () => {
  const targets = [{pid:42, bundleId:'ai.cua.benchlab'}];
  const calls = [];
  const record = async (method, params) => { calls.push([method, params]); return {ok:true}; };
  const params = {pid:42, windowId:8, mode:'foreground', x:15, y:25, screenshot:true};
  const background = createScopedRequest(record, targets);
  const foreground = createScopedRequest(record, targets, undefined, {allowForegroundHover:true});
  await assert.rejects(background('hover', params), {code:'BENCH_GUI_ONLY'});
  await assert.rejects(foreground('hover', {...params, mode:'background'}), {code:'BENCH_GUI_ONLY'});
  await assert.rejects(foreground('hover', {...params, pid:77}), {code:'BENCH_GUI_ONLY'});
  await assert.rejects(foreground('hover', {...params, windowId:undefined}), {code:'BENCH_GUI_ONLY'});
  await assert.rejects(foreground('click', params), {code:'BENCH_GUI_ONLY'});
  await foreground('hover', params);
  assert.deepEqual(calls, [['hover', params]]);
});
