// Fully covered standard AppKit controls, in a cooperative quiet test app.
import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {Bridge} from '../src/bridge.mjs';import {startBackgroundFixture} from './background-fixture.mjs';import {startFocusTrace,recordedWindowOrder} from './focus-trace.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'artifacts/raw-controls-'+Date.now());mkdirSync(directory,{recursive:true});
const trace=await startFocusTrace(directory,{seconds:45}),bridge=new Bridge({executable:process.env.CU_TEST_NATIVE_HELPER,env:{...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target'}});let f,report={status:'running',operations:[]};
const save=()=>writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
try{
 f=await startBackgroundFixture(directory,{background:true,regular:true,launchServices:true});const target={pid:f.apps.target.pid,windowId:f.apps.target.windowId};const proof=()=>JSON.parse(f.run(f.driver,['occlusion',String(target.pid),String(target.windowId),String(f.apps.cover.windowId)]));
 async function action(method,args){const before=proof();assert.equal(before.fullyCovered,true);const result=await bridge.request(method,{...target,...args,mode:'background'});const after=proof();report.operations.push({method,args,result,before,after});save();assert.equal(after.fullyCovered,true);return result}
 for(let attempt=0;attempt<15;attempt++){
  try{await bridge.request('snapshot',{...target,screenshot:false});break}
  catch(error){if(attempt===14||!['AX_WINDOW_UNRESOLVED','AX_ERROR'].includes(error.code))throw error;await new Promise(r=>setTimeout(r,100))}
 }
 for(let i=1;i<=6;i++){
  const s=await bridge.request('snapshot',{...target,screenshot:false}),button=s.nodes.find(n=>n.identifier==='apply-message');assert.ok(button?.frame);const r=button.frame;
  await action('click',{x:r.x+r.width/2,y:r.y+r.height/2,strategy:'event'});assert.equal(f.read('target').count,i);
 }
 const s=await bridge.request('snapshot',{...target,screenshot:false}),scroll=s.nodes.find(n=>n.identifier==='scroll-area');assert.ok(scroll?.frame);const r=scroll.frame;
 await action('drag',{fromX:r.x+20,fromY:r.y+15,toX:r.x+250,toY:r.y+15,duration:0.3});
 const after=await bridge.request('snapshot',{...target,screenshot:false});report.afterDrag=after;const area=after.nodes.find(n=>n.identifier==='scroll-document');assert.ok(area?.selectedRange?.length>0,'Raw drag must select NSTextView text');
 report={...report,status:'raw-standard-controls-passed',target,state:f.read('target'),selection:area.selectedRange,AXMutationsGenerated:false,globalInputGenerated:false};
}catch(error){report={...report,status:'failed',error:{code:error.code,message:error.message},state:f?.read('target')};process.exitCode=1}
finally{trace.close();await new Promise(r=>trace.child.exitCode!==null?r():trace.child.once('exit',r));const o=trace.read();if(f){const order=recordedWindowOrder(o,f.apps.target.windowId,f.apps.cover.windowId);report.recordedWindowOrder=order;if(!order.recordsCompared||order.violations.length){report.status='failed';report.windowOrderError='Recorded window-order violation or missing coverage';process.exitCode=1}}report.observation={sampleCount:o.sampleCount,maxSampleGap:o.maxSampleGap,keyboardPIDs:[...new Set(o.samples.map(s=>s.keyboardPID))]};save();f?.close();bridge.close();console.log('REPORT',path.join(directory,'report.json'))}
