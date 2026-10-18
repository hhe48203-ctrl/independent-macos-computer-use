import test from 'node:test';import assert from 'node:assert/strict';import{existsSync}from'node:fs';import{fileURLToPath}from'node:url';import{Bridge}from'../src/bridge.mjs';
const helper=fileURLToPath(new URL('../.build/Local Computer Use.app/Contents/MacOS/computer-use-bridge',import.meta.url));
test('native background-only policy rejects foreground and unknown modes before OS actions',{skip:process.platform!=='darwin'||!existsSync(helper)},async()=>{
 const bridge=new Bridge({env:{...process.env,CU_ENABLE_FOREGROUND:'0'}});
 try{
  const status=await bridge.request('status');assert.equal(status.foregroundEnabled,false);assert.equal(status.background.experimentalAppKitFocus,false);
  for(const[method,params]of[['focus',{pid:1,windowId:2}],['click',{pid:1,windowId:2,x:0,y:0,mode:'foreground'}],['launch',{bundleId:'com.apple.TextEdit',mode:'foreground'}],['ax_action',{mode:'foreground'}]])await assert.rejects(bridge.request(method,params),{code:'FOREGROUND_DISABLED'});
  await assert.rejects(bridge.request('click',{pid:1,windowId:2,x:0,y:0,mode:'unknown'}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(bridge.request('launch',{bundleId:'io.local.computeruse.uninstalled-policy-test'}),{code:'VISIBLE_LAUNCH_REQUIRED'});
 }finally{bridge.close()}
 const explicit=new Bridge({env:{...process.env,CU_ENABLE_FOREGROUND:'1'}});try{assert.equal((await explicit.request('status')).foregroundEnabled,true)}finally{explicit.close()}
});
