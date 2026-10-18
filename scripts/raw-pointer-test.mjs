import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Bridge} from '../src/bridge.mjs';
import {startBackgroundFixture} from './background-fixture.mjs';
import {startFocusTrace} from './focus-trace.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=path.join(root,'artifacts/raw-pointer-'+Date.now());mkdirSync(directory,{recursive:true});
const setup=await startFocusTrace(directory,{seconds:45});let fixture,events;const bridge=new Bridge({env:{...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target,io.local.computeruse.foreground-workspace'}});
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
 assert.ok(observation.samples.every(s=>s.keyboardFocusResolved&&s.foregroundPID!==target.pid&&s.keyboardPID!==target.pid));
 report={status:'raw-pointer-checks-passed',operations,scope:'Raw click, scroll and drag on a covered custom AppKit event pad, with no AX actions. Not a universal app or foreground-text concurrency pass.',actualRecipientEvidence:received.processEvents.filter(e=>e.tag===0x43554247),observation:{sampleCount:observation.sampleCount,maxSampleGap:observation.maxSampleGap,keyboardPIDs:[...new Set(observation.samples.map(s=>s.keyboardPID))]}};save();console.log('REPORT',path.join(directory,'report.json'));
}catch(error){report={status:'failed',error:{code:error.code,message:error.message},operations};save();console.error('REPORT',path.join(directory,'report.json'));throw error}
finally{bridge.close();events?.close();setup.close();fixture?.close()}
