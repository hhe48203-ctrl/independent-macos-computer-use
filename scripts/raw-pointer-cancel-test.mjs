import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Bridge} from '../src/bridge.mjs';import {startFocusTrace,recordedWindowOrder} from './focus-trace.mjs';import {startBackgroundFixture} from './background-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'artifacts/raw-pointer-cancel-'+Date.now());mkdirSync(directory,{recursive:true});
const trace=await startFocusTrace(directory,{seconds:40});const bridge=new Bridge({executable:process.env.CU_TEST_NATIVE_HELPER,env:{...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target'}});let fixture,report={status:'running'};
try{
 fixture=await startBackgroundFixture(directory,{background:true,regular:true,launchServices:true});const target={pid:fixture.apps.target.pid,windowId:fixture.apps.target.windowId};
 const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(fixture.apps.cover.windowId)]));assert.equal(proof().fullyCovered,true);
 await bridge.request('status');const abort=new AbortController();const action=bridge.request('drag',{...target,fromX:100,fromY:280,toX:450,toY:330,duration:2,mode:'background'},{signal:abort.signal});
 const rejected=assert.rejects(action,{code:'CANCELLED'});let during;
 for(let i=0;i<100;i++){during=fixture.read('target');if(during.drags>=3)break;await new Promise(r=>setTimeout(r,20))}
 assert.ok(during.drags>=3);abort.abort();await rejected;await bridge.retiring;await new Promise(r=>setTimeout(r,100));
 const after=fixture.read('target'),events=fixture.read('target','events').filter(e=>[1,2,6].includes(e.type));
 assert.equal(after.active,false);assert.equal(after.key,false);assert.equal(after.clicks,1);assert.equal(after.releases,1);assert.ok(after.drags>=3&&after.drags<30);assert.ok(events.every(e=>e.flags===0));assert.equal(proof().fullyCovered,true);
 trace.close();await new Promise(r=>trace.child.exitCode!==null?r():trace.child.once('exit',r));const observation=trace.read();const windowOrder=recordedWindowOrder(observation,target.windowId,fixture.apps.cover.windowId);assert.ok(windowOrder.recordsCompared>0&&windowOrder.violations.length===0);assert.ok(observation.samples.every(s=>s.keyboardFocusResolved&&s.keyboardPID!==target.pid&&s.foregroundPID!==target.pid));
 report={status:'cancelled-drag-release-passed',recordedWindowOrder:windowOrder,target,during,after,appKitEvents:events,proof:proof(),observation:{sampleCount:observation.sampleCount,maxSampleGap:observation.maxSampleGap},scope:'Cancellation during a real covered fixture drag; no foreground text integrity measurement'};
}catch(error){report={...report,status:'failed',error:error.message};process.exitCode=1}
finally{
 bridge.close();trace.close();
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
 console.log('REPORT',path.join(directory,'report.json'));
 await bridge.retiring;
 await fixture?.closeAndWait();
}
