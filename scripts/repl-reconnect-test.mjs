// Restart only an owned fixture; explicit selection must produce a fresh binding.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {startBackgroundFixture} from './background-fixture.mjs';
import {connectRepl,parseAX} from './repl-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=root+`artifacts/reconnect-${Date.now()}`;mkdirSync(directory,{recursive:true});
const fixture=await startBackgroundFixture(directory,{background:true,allSpaces:true}),old=fixture.apps.target;
const repl=await connectRepl({...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target'});
let next,report={status:'running',directory};
try{
 const initial=await repl.evaluate(`(async()=>{globalThis.oldApp=await cua.getApp({pid:${old.pid},windowId:${old.windowId}},{coordinateMode:'original',maxDimension:640});return oldApp.getCoordinateInfo({emit:false})})()`);
 old.child.kill('SIGTERM');await new Promise(r=>old.child.exitCode!==null?r():old.child.once('exit',r));
 await assert.rejects(repl.evaluate('oldApp.click([50,50])'),/WINDOW_GONE/);
 next=await startBackgroundFixture(directory+'/replacement',{roles:['target'],background:true,allSpaces:true});const t=next.apps.target;assert.notEqual(t.pid,old.pid);
 const candidates=await repl.evaluate('oldApp.reconnect()');assert.ok(candidates.candidates.some(w=>w.windowId===t.windowId&&w.pid===t.pid));
 await new Promise(r=>setTimeout(r,800));
 const connected=await repl.evaluate(`(async()=>{globalThis.app=await oldApp.reconnect({pid:${t.pid},windowId:${t.windowId}});return {pid:app.pid,windowId:app.windowId,mapping:await app.getCoordinateInfo({emit:false}),state:await app.getAXState({emit:false,disableDiffing:true})}})()`);
 assert.equal(connected.pid,t.pid);assert.equal(connected.mapping.mode,'original');assert.equal(connected.mapping.unit,'screenshot pixels');assert.equal(connected.mapping.range.maxXExclusive,640);
 const field=parseAX(connected.state).nodes.find(n=>n.identifier==='message-input');await repl.evaluate(`app.setValue(${field.id},'Reconnected 中文')`);assert.equal(next.read('target').input,'Reconnected 中文');
 await assert.rejects(repl.evaluate('oldApp.setValue(2,"stale")'),/INVALID_ELEMENT|WINDOW_GONE/);
 const proof=JSON.parse(fixture.run(fixture.driver,['occlusion',String(t.pid),String(t.windowId),String(fixture.apps.cover.windowId)]));assert.equal(proof.fullyCovered,true);assert.notEqual(proof.frontPid,t.pid);
 report={...report,status:'passed',old:{pid:old.pid,windowId:old.windowId},replacement:{pid:t.pid,windowId:t.windowId},initial,candidates,connected,proof};
}catch(e){report={...report,status:'failed',error:e.message};process.exitCode=1}
finally{writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));writeFileSync(directory+'/calls.json',JSON.stringify(repl.calls,null,2));await repl.client.close();next?.close();fixture.close();console.log('REPORT',directory+'/report.json',report.status,report.error??'')}
