// Original input comes only from the legitimate cua_repl tool. This process
// observes owned fixtures; it never imports/connects to the original runtime.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {createInterface} from 'node:readline';import {fileURLToPath} from 'node:url';
import {startBackgroundFixture} from './background-fixture.mjs';import {startFocusTrace,recordedWindowOrder} from './focus-trace.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=root+`artifacts/original-focus-cause-${Date.now()}`;mkdirSync(directory,{recursive:true});
let fixture,trace;let report={status:'preparing',directory,phases:[]},last=Date.now()/1000;
const save=()=>writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));
try{
 fixture=await startBackgroundFixture(directory,{background:true,documentInput:true,focusDiagnostics:true,targetRegular:true});const t=fixture.apps.target;
 const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(t.pid),String(t.windowId),String(fixture.apps.cover.windowId)]));
 assert.equal(proof().fullyCovered,true);
 trace=await startFocusTrace(directory,{seconds:180,targetPID:t.pid});
 last=Date.now()/1000;report={...report,status:'ready',target:{pid:t.pid,windowId:t.windowId,bundle:'io.local.computeruse.document-target'},initialProof:proof()};save();console.log('ORIGINAL_CAUSE_READY',JSON.stringify({directory,target:report.target}));
 const lines=createInterface({input:process.stdin,crlfDelay:Infinity});const stop=()=>lines.close();process.once('SIGTERM',stop);process.once('SIGINT',stop);let expired=false;
 const deadline=setTimeout(()=>{expired=true;lines.close()},170000);
 try{
  for await(const line of lines){if(!line.trim())continue;const c=JSON.parse(line);if(c.step==='finish')break;
   await new Promise(r=>setTimeout(r,250));const end=Date.now()/1000;
   const state=JSON.parse(readFileSync(directory+'/target-focus-diagnostics.json')).events.filter(e=>e.epoch>=last&&e.epoch<=end);
   const phase={name:c.step,start:last,end,toolError:c.error??null,proof:proof(),contextActivations:state.filter(e=>e.name==='input-context-activate-before').length,contextDeactivations:state.filter(e=>e.name==='input-context-deactivate-before').length,orders:state.filter(e=>['order','orderFront','orderFrontRegardless','makeKeyAndOrderFront'].includes(e.name)),trace:state};
   report.phases.push(phase);last=end;save();console.log('CHECKPOINT',JSON.stringify({name:phase.name,contextActivations:phase.contextActivations,contextDeactivations:phase.contextDeactivations,orders:phase.orders.map(e=>e.name),covered:phase.proof.fullyCovered,toolError:phase.toolError}));
  }
 }finally{clearTimeout(deadline);lines.close();process.stdin.pause();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop)}
 trace.close();await new Promise(r=>trace.child.exitCode!==null||trace.child.signalCode!==null?r():trace.child.once('exit',r));const observations=trace.read();
 const order=recordedWindowOrder(observations,t.windowId,fixture.apps.cover.windowId);
 report={...report,status:expired?'inconclusive-timeout':order.violations.length?'observed-reordering':'completed-observation',windowOrder:order,observation:{sampleCount:observations.sampleCount,maxSampleGap:observations.maxSampleGap,targetForegroundSamples:observations.samples.filter(s=>s.foregroundPID===t.pid).length,targetKeySamples:observations.samples.filter(s=>s.keyboardPID===t.pid).length},finalProof:proof()};
}catch(e){report={...report,status:'failed',error:e.message};process.exitCode=1}
finally{trace?.close();if(fixture)await fixture.closeAndWait();save();console.log('REPORT',directory+'/report.json',report.status)}
