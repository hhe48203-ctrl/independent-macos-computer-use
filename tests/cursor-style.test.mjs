import test from 'node:test';import assert from 'node:assert/strict';import{existsSync}from'node:fs';import{fileURLToPath}from'node:url';import{Bridge}from'../src/bridge.mjs';
const helper=fileURLToPath(new URL('../.build/Local Computer Use.app/Contents/MacOS/computer-use-bridge',import.meta.url));
// The cursor overlay itself needs a live window, but the selected style is
// reported without one, so this checks the contract the agent can observe.
test('agent cursor defaults to the ring reticle and keeps the arrow selectable',{skip:process.platform!=='darwin'||!existsSync(helper)},async()=>{
 const read=async env=>{const bridge=new Bridge({env:{...process.env,...env}});try{return await bridge.request('cursor_state')}finally{bridge.close()}};
 const fallback=await read({CU_AGENT_CURSOR_STYLE:''});assert.equal(fallback.style,'ring');assert.match(fallback.styleDescription,/reticle/);
 const arrow=await read({CU_AGENT_CURSOR_STYLE:'arrow'});assert.equal(arrow.style,'arrow');assert.match(arrow.styleDescription,/translucent light outline/);
 assert.notEqual(arrow.styleDescription,fallback.styleDescription);
 assert.equal((await read({CU_AGENT_CURSOR_STYLE:'Ring'})).style,'ring');
 assert.equal((await read({CU_AGENT_CURSOR_STYLE:'unknown-style'})).style,'ring');
 assert.equal((await read({CU_AGENT_CURSOR:'0'})).enabled,false);
 assert.equal((await read({CU_AGENT_CURSOR_VISIBILITY:''})).visibilityMode,'target');
 assert.equal((await read({CU_AGENT_CURSOR_VISIBILITY:'ALWAYS'})).visibilityMode,'always');
 assert.equal((await read({CU_AGENT_CURSOR_VISIBILITY:'invalid'})).visibilityMode,'target');
});
