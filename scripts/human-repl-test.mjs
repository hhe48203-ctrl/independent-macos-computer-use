// Start only after a person has agreed to participate. Never activates windows,
// generates foreground typing, or records unmarked draft / hardware key text.
import assert from 'node:assert/strict';import {randomInt} from 'node:crypto';import {mkdirSync,writeFileSync,existsSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {connectRepl,parseAX} from './repl-client.mjs';
import {startBackgroundFixture} from './background-fixture.mjs';import {startFocusTrace,recordedWindowOrder} from './focus-trace.mjs';
assert.equal(process.env.CU_TEST_HUMAN_AGREED,'1','Arrange participation before starting CU_TEST_HUMAN_AGREED=1');
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'artifacts/human-repl-'+Date.now());mkdirSync(directory,{recursive:true});
const phrase=`CUH-${randomInt(1000,10000)}-abcdef`;
const documentMode=process.env.CU_HUMAN_TEST_DOCUMENT==='1';
if(documentMode)assert.equal(process.env.CU_EXPERIMENTAL_APPKIT_FOCUS,'1','Document concurrency explicitly requires experimental app-local focus');
let repl;let client;
const trace=await startFocusTrace(directory,{seconds:180,env:{...process.env,CU_HUMAN_TEST_TEXT:phrase,CU_HUMAN_TEST_KEY_METADATA:'1',CU_HUMAN_TEST_START_FILE:path.join(directory,'start')}});let fixture,report={status:'preparing',expectedPhrase:phrase,documentMode,operations:[]};
const save=()=>writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
async function call(name,args={}){
 let expression;
 if(name==='cu_status')expression='cua.status({emit:false})';
 else if(name==='cu_snapshot')return parseAX(await repl.evaluate('app.getAXState({emit:false,disableDiffing:true})'));
 else if(name==='cu_key')expression=`app.pressKey(${JSON.stringify(args.key)},{strategy:'event'})`;
 else if(name==='cu_type_text')expression=`app.typeText(${JSON.stringify(args.text)},{strategy:'event'})`;
 else if(name==='cu_drag')expression=`app.drag([${args.fromX},${args.fromY}],[${args.toX},${args.toY}],{duration:${args.duration}})`;
 else if(name==='cu_scroll')expression=`app.scroll([${args.x},${args.y}],'down',0.6)`;
 else if(name==='cu_click')expression=`app.click([${args.x},${args.y}],{strategy:'event'})`;
 else throw Error('Unknown harness operation');
 return repl.evaluate(expression);
}
try{
 fixture=await startBackgroundFixture(directory,{background:true,documentInput:documentMode});const target={pid:fixture.apps.target.pid,windowId:fixture.apps.target.windowId};
 const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(fixture.apps.cover.windowId)]));assert.equal(proof().fullyCovered,true);
 repl=await connectRepl({...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:documentMode?'io.local.computeruse.document-target':'io.local.computeruse.background-target'});client=repl.client;
 await repl.evaluate(`(async()=>{globalThis.app=await cua.getApp({pid:${target.pid},windowId:${target.windowId}});return {pid:app.pid}})()`);
 const status=await call('cu_status');assert.equal(status.foregroundEnabled,false);assert.equal(status.inputFocus.keyboardFocusResolved,true);
 const observerHealth=trace.read();assert.ok(observerHealth?.humanTextObservation?.cachedCandidateFields>0,'No candidate Codex input field; do not ask the participant to type');
 assert.ok(observerHealth.humanKeyRecipientObservation?.tapAvailable&&observerHealth.humanKeyRecipientObservation.tapEnabled,'Foreground recipient metadata observer unavailable; do not start participant input');
 const snapshot=()=>call('cu_snapshot',{...target,screenshot:false}),doc=s=>s.nodes.find(n=>n.identifier==='scroll-document');
 let expectedDocument=documentMode?doc(await snapshot()).value:undefined;
 async function action(name,args){const before=proof();assert.equal(before.fullyCovered,true);const startEpoch=Date.now()/1000;const result=await call(name,{...target,...args,mode:'background'});const after=proof();report.operations.push({name,args,result,before,after,startEpoch,endEpoch:Date.now()/1000,t:(Date.now()-started)/1000});save();assert.equal(after.fullyCovered,true);return result}
 report={...report,status:'ready',target,statusMetadata:status,observerHealth:{candidateFields:observerHealth.humanTextObservation.cachedCandidateFields,recipientTapAvailable:true}};save();writeFileSync(path.join(directory,'ready.json'),JSON.stringify({directory,phrase,startFile:path.join(directory,'start')}));console.log('HUMAN_READY',directory,phrase);
 const waitUntil=Date.now()+180000;while(!existsSync(path.join(directory,'start'))){assert.ok(Date.now()<waitUntil,'No start signal; no action generated');await new Promise(r=>setTimeout(r,100))}
 const started=Date.now();let round=0;report.startEpoch=started/1000;report.status='running';save();
 while(true){
  if(documentMode){
   await action('cu_key',{key:'CMD+Down',strategy:'event'});const prepared=await snapshot(),area=doc(prepared);
   assert.equal(area.selectedRange.location,expectedDocument.length);assert.equal(area.selectedRange.length,0);
   const text=`【后台并用 ${round} 中文🙂】`;const typed=await action('cu_type_text',{text,strategy:'event',snapshotId:prepared.snapshotId,elementId:area.id});assert.ok(typed.verified&&typed.AXActionsGenerated===false);expectedDocument+=text;
   await action('cu_key',{key:'CMD+A',strategy:'event'});assert.equal(doc(await snapshot()).selectedRange.length,expectedDocument.length);
   await action('cu_key',{key:'CMD+Up',strategy:'event'});const top=await snapshot(),scroll=top.nodes.find(n=>n.identifier==='scroll-area').frame;
   await action('cu_drag',{fromX:scroll.x+20,fromY:scroll.y+15,toX:scroll.x+250,toY:scroll.y+15,duration:0.2});assert.ok(doc(await snapshot()).selectedRange.length>0);
   await action('cu_scroll',{x:scroll.x+200,y:scroll.y+50,deltaY:-250});const after=await snapshot();assert.equal(doc(after).value,expectedDocument);
   const button=after.nodes.find(n=>n.identifier==='apply-message').frame;await action('cu_click',{x:button.x+button.width/2,y:button.y+button.height/2,strategy:'event'});
  }else for(const [name,args]of [['cu_click',{x:100,y:290,strategy:'event'}],['cu_scroll',{x:100,y:290,deltaY:-100}],['cu_drag',{fromX:100,fromY:280,toX:400,toY:330,duration:0.2}]])await action(name,args);
  round++;
  const liveObservation=trace.read();const observed=liveObservation?.humanTextObservation;const humanStart=observed?.firstMarkedEpoch??liveObservation?.humanKeyRecipientObservation?.firstEpoch;
  if(!report.measurementStartEpoch&&humanStart){report.measurementStartEpoch=humanStart;console.log('HUMAN_MEASUREMENT_STARTED',report.measurementStartEpoch);save()}
  if(report.measurementStartEpoch&&Date.now()/1000-report.measurementStartEpoch>=30)break;
  assert.ok(report.measurementStartEpoch||Date.now()-started<60000,'No marked human input within 60 seconds; no concurrency pass');
 }
 report.endEpoch=Date.now()/1000;report.rounds=round;report.targetState=fixture.read('target');
 trace.close();await new Promise(r=>trace.child.exitCode!==null?r():trace.child.once('exit',r));const o=trace.read(),text=o.humanTextObservation;
 const windowOrder=recordedWindowOrder(o,target.windowId,fixture.apps.cover.windowId);assert.ok(windowOrder.recordsCompared>0&&windowOrder.violations.length===0);
 assert.ok(o.samples.every(s=>s.keyboardFocusResolved&&s.keyboardPID!==target.pid&&s.foregroundPID!==target.pid));
 assert.ok(text?.lastComplete&&text.completeSamples>0&&text.firstCompleteEpoch>=report.startEpoch&&text.firstCompleteEpoch<=report.endEpoch,'The fresh marked foreground phrase must be observed complete inside the operation interval');
 const keys=o.humanKeyRecipientObservation;assert.ok(keys?.tapAvailable&&keys.tapEnabled&&keys.disabledCount===0&&keys.boundPID===text.pid&&keys.keyDownCount>=phrase.length,'Actual foreground key receipt must be observed, without reading key contents');
 assert.ok(!keys.sourcePIDs.includes(status.pid)&&keys.rawTargetPIDFields.every(pid=>pid===0||pid===text.pid),'Background helper keys must never appear in the Codex recipient tap');
 const live=o.samples.filter(s=>s.t+o.startedEpoch>=report.measurementStartEpoch && s.t+o.startedEpoch<=report.endEpoch); // Fall back to all samples when older observer schema has no epoch.
 const pointerSamples=live;assert.ok(pointerSamples.length>0,'No measured pointer samples');
 const pointerPositions=new Set(pointerSamples.map(s=>s.pointer.x+','+s.pointer.y)).size;assert.ok(pointerPositions>=20,'Concurrent pointer movement was not observed');
 const received=fixture.read('target','events').filter(e=>[1,2,6].includes(e.type));assert.ok(received.every(e=>e.flags===0));
 report={...report,status:'human-repl-observed-checks-passed',publicTools:['js','js_reset'],recordedWindowOrder:windowOrder,foregroundText:text,foregroundKeyRecipient:keys,pointerDistinctPositions:pointerPositions,focusObservation:{sampleCount:o.sampleCount,maxSampleGap:o.maxSampleGap,keyboardPIDs:[...new Set(o.samples.map(s=>s.keyboardPID))]},scope:documentMode?'Human entered the known phrase in Codex while covered first-party AppKit real text, keys, click, selection drag and scroll ran. No universal stock-app claim.':'Human entered the known phrase in Codex while covered first-party AppKit raw click, scroll and drag ran. No universal stock-app claim.'};
}catch(error){report={...report,status:'failed-or-inconclusive',error:error.message};process.exitCode=1}
finally{save();trace.close();fixture?.close();if(repl){writeFileSync(path.join(directory,'js-calls.json'),JSON.stringify(repl.calls,null,2));await client.close();}console.log('REPORT',path.join(directory,'report.json'))}
