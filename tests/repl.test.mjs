import test from 'node:test';
import assert from 'node:assert/strict';
import { CuaRepl } from '../src/repl.mjs';
function fixture() {
  const calls=[];const bridge={retiring:Promise.resolve(),stop(){calls.push('stop');},close(){},async request(method,args){calls.push({method,args});if(method==='status')return {backend:'test'};return {};}};
  return {calls,runtime:new CuaRepl(bridge)};
}
const text=r=>r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
test('real lexical REPL preserves await/let/const/var, recovers exceptions, captures output and resets',async()=>{
  const {runtime}=fixture();try {
    let r=await runtime.execute('let count=await Promise.resolve(40); const obj={n:1}; var label="kept";');assert.ok(!r.isError);
    r=await runtime.execute('count+=obj.n; console.log(label); nodeRepl.write({count}); count+1');assert.match(text(r),/kept[\s\S]*count: 41[\s\S]*42/);
    r=await runtime.execute('throw Error("recoverable")');assert.equal(r.isError,true);assert.match(text(r),/recoverable/);
    r=await runtime.execute('await Promise.reject(Error("async error"))');assert.equal(r.isError,true);
    r=await runtime.execute('count');assert.equal(text(r),'41');
    r=await runtime.execute('const obj=2');assert.equal(r.isError,true);
    await runtime.reset();r=await runtime.execute('typeof count');assert.match(text(r),/'undefined'/);
  }finally{await runtime.close();}
});
test('infinite loop, cancellation and worker exit are bounded and clear bindings',async()=>{
  const {runtime,calls}=fixture();try {
    let r=await runtime.execute('let stale=1; while(true){}',{timeoutMs:150});assert.equal(r.structuredContent.error.code,'JS_TIMEOUT');
    r=await runtime.execute('typeof stale');assert.match(text(r),/'undefined'/);
    const controller=new AbortController();const pending=runtime.execute('await new Promise(()=>{})',{signal:controller.signal});setTimeout(()=>controller.abort(),100);
    r=await pending;assert.equal(r.structuredContent.error.code,'CANCELLED');
    r=await runtime.execute('process.exit(4)');assert.equal(r.structuredContent.error.code,'WORKER_EXITED');
    r=await runtime.execute('6*7');assert.match(text(r),/42/);assert.ok(calls.includes('stop'));
  }finally{await runtime.close();}
});
test('late callbacks cannot issue native work in a subsequent execution',async()=>{
  const {runtime,calls}=fixture();try {
    await runtime.execute('setTimeout(()=>cua.status().catch(()=>{}),100); undefined');
    await runtime.execute('await new Promise(r=>setTimeout(r,180)); 42');
    assert.equal(calls.filter(c=>c.method==='status').length,0);
    const r=await runtime.execute('await cua.status({emit:false})');assert.match(text(r),/backend: 'test'/);
    assert.equal(calls.filter(c=>c.method==='status').length,1);
  }finally{await runtime.close();}
});
test('reset invalidates queued executions and stops pending operations',async()=>{
  const {runtime,calls}=fixture();try{
    const first=runtime.execute('await new Promise(()=>{})');const queued=runtime.execute('await cua.status()');
    await new Promise(r=>setTimeout(r,100));await runtime.reset();
    assert.equal((await first).isError,true);await assert.rejects(queued,{code:'SESSION_CHANGED'});
    assert.equal(calls.filter(c=>c.method==='status').length,0);
  }finally{await runtime.close();}
});
test('rich images accept VM typed arrays and result inspection cannot issue late desktop work',async()=>{
  const {runtime,calls}=fixture();try{
    const r=await runtime.execute(`await nodeRepl.emitImage(new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'))); undefined`);
    assert.ok(!r.isError);assert.equal(r.content.filter(c=>c.type==='image').length,1);
    const inspected=await runtime.execute(`var obj={[Symbol.for('nodejs.util.inspect.custom')](){cua.status();return 'unsafe'}}; obj`);
    assert.ok(!inspected.isError);assert.equal(calls.filter(c=>c.method==='status').length,0);
    const imported=await runtime.execute(`var os=await import('node:os'); os.platform()`);assert.ok(!imported.isError);assert.match(text(imported),new RegExp(process.platform));
  }finally{await runtime.close();}
});
