import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bridge } from '../src/bridge.mjs';

function helper(source) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cu-bridge-test-'));
  const executable = path.join(dir, 'helper');
  writeFileSync(executable, `#!${process.execPath}\n${source}`, { mode: 0o700 });
  return { executable, remove: () => rmSync(dir, { recursive: true, force: true }) };
}
test('persistent transport serializes, reports native errors and recovers without retry', async () => {
  const h = helper(`const readline = require('node:readline'); let busy=false; readline.createInterface({input:process.stdin}).on('line', l=> { if(busy) process.exit(12); busy=true; const r=JSON.parse(l); setTimeout(()=> { console.log(JSON.stringify({id:r.id,...(r.method==='bad'?{error:{code:'EXPECTED',message:'fixture'}}:{result:{method:r.method}})})); busy=false; }, 15); });`);
  const b = new Bridge({ executable: h.executable });
  try {
    assert.deepEqual(await Promise.all([b.request('a'), b.request('b')]), [{ method: 'a' }, { method: 'b' }]);
    await assert.rejects(b.request('bad'), { code: 'EXPECTED' });
    assert.deepEqual(await b.request('c'), { method: 'c' });
  } finally { b.close(); h.remove(); }
});
test('timeout kills helper, invalidates queued mutations and allows fresh observations', async () => {
  const h = helper(`require('node:readline').createInterface({input:process.stdin}).on('line', l=>{const r=JSON.parse(l);if(r.method!=='hang')console.log(JSON.stringify({id:r.id,result:{method:r.method}}));});`);
  const b = new Bridge({ executable: h.executable, timeoutMs: 500 });
  try {
    const results = await Promise.allSettled([b.request('hang'), b.request('mutation')]);
    assert.equal(results[0].reason.code, 'NATIVE_TIMEOUT');
    assert.equal(results[1].reason.code, 'SESSION_CHANGED');
    b.timeoutMs = 2000;
    assert.deepEqual(await b.request('status'), { method: 'status' });
  } finally { b.close(); h.remove(); }
});
test('cancellation stops active helper and never executes an already-aborted request', async () => {
  const h = helper(`require('node:readline').createInterface({input:process.stdin}).on('line',()=>{});`);
  const b = new Bridge({ executable: h.executable });
  try {
    const controller = new AbortController();
    const call = b.request('hang', {}, { signal: controller.signal });
    setTimeout(() => controller.abort(), 40);
    await assert.rejects(call, { code: 'CANCELLED' });
    await assert.rejects(b.request('anything', {}, { signal: controller.signal }), { code: 'CANCELLED' });
  } finally { b.close(); h.remove(); }
});
test('a failed spawn reports error and does not strand the next request', async () => {
  const h = helper('');
  const b = new Bridge({ executable: h.executable });
  try {
    // A real file with a nonexistent interpreter fails after spawn returns.
    writeFileSync(h.executable, '#!/nonexistent/cu-test-interpreter\n', { mode: 0o700 });
    await assert.rejects(b.request('first'), { code: 'BRIDGE_START_FAILED' });
    await assert.rejects(b.request('second'), { code: 'BRIDGE_START_FAILED' });
  } finally { b.close(); h.remove(); }
});
