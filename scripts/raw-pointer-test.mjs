import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Bridge} from '../src/bridge.mjs';
import {startBackgroundFixture} from './background-fixture.mjs';
import {startFocusTrace,recordedWindowOrder} from './focus-trace.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=path.join(root,'artifacts/raw-pointer-'+Date.now());mkdirSync(directory,{recursive:true});
const setup=await startFocusTrace(directory,{seconds:45});let fixture,events;const bridge=new Bridge({executable:process.env.CU_TEST_NATIVE_HELPER,env:{...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target,io.local.computeruse.foreground-workspace'}});
const operations=[];let report;
const save=()=>writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
try{
 fixture=await startBackgroundFixture(directory,{background:true,regular:true,launchServices:true});
 const target={pid:fixture.apps.target.pid,windowId:fixture.apps.target.windowId};
 const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(fixture.apps.cover.windowId)]));
 assert.equal(proof().fullyCovered,true);events=await startFocusTrace(directory+'/process',{seconds:30,targetPID:target.pid});
 for(const [method,args,counter] of [['click',{x:100,y:290,strategy:'event'},'clicks'],['scroll',{x:100,y:290,deltaY:-200},'scrolls'],['drag',{fromX:100,fromY:280,toX:400,toY:330,duration:0.3},'drags']]){
   const before=proof();assert.equal(before.fullyCovered,true);const previous=fixture.read('target')[counter];
   try{const result=await bridge.request(method,{...target,...args,mode:'background'});const after=proof();const state=fixture.read('target');operations.push({method,args,result,before,after,state});assert.ok(state[counter]>previous);assert.equal(after.fullyCovered,true)}
   catch(error){operations.push({method,args,error:{code:error.code,message:error.message},before,after:proof(),state:fixture.read('target')});throw error}
 }
 for(const trace of [events,setup]){trace.close();await new Promise(r=>trace.child.exitCode!==null?r():trace.child.once('exit',r))}
 const observation=setup.read(),received=events.read();
 const windowOrder=recordedWindowOrder(observation,target.windowId,fixture.apps.cover.windowId);assert.ok(windowOrder.recordsCompared>0&&windowOrder.violations.length===0);
 assert.ok(observation.samples.every(s=>s.keyboardFocusResolved&&s.foregroundPID!==target.pid&&s.keyboardPID!==target.pid));
 const delivered=fixture.read('target','events').filter(e=>[1,2,6].includes(e.type));assert.ok(delivered.length>=4&&delivered.every(e=>e.flags===0));
 for(const op of operations.filter(o=>o.method!=='scroll')){assert.equal(op.result.pointerDelivery.postedEvents,op.result.pointerDelivery.observedEvents);assert.equal(op.result.pointerDelivery.postedEvents,op.result.pointerDelivery.rewrittenEvents)}
 report={status:'raw-pointer-checks-passed',recordedWindowOrder:windowOrder,operations,scope:'Raw click, scroll and drag on a covered custom AppKit event pad, with no AX actions. Not a universal app or foreground-text concurrency pass.',deliveredAppKitMouseEvents:delivered,actualRecipientEvidence:received.processEvents.filter(e=>((e.tag>>>0)===0x43554247 || ((e.tag>>>0)&0xffff0000)===0x43420000)),observation:{sampleCount:observation.sampleCount,maxSampleGap:observation.maxSampleGap,keyboardPIDs:[...new Set(observation.samples.map(s=>s.keyboardPID))]}};save();console.log('REPORT',path.join(directory,'report.json'));
}catch(error){report={status:'failed',error:{code:error.code,message:error.message},operations};save();console.error('REPORT',path.join(directory,'report.json'));throw error}
finally{bridge.close();events?.close();setup.close();fixture?.close()}
