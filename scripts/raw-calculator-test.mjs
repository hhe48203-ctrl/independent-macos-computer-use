// Uses an existing Calculator window and an existing occluder. No app launch,
// activation, layout change, AX action, clipboard operation or global input.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {startFocusTrace} from './focus-trace.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const [pid,windowId,coverId]=process.argv.slice(2).map(Number);
if(![pid,windowId,coverId].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Usage: node scripts/raw-calculator-test.mjs CALCULATOR_PID WINDOW_ID EXISTING_COVER_ID');
const directory=path.join(root,'artifacts/raw-calculator-'+Date.now());mkdirSync(directory,{recursive:true});
const driver=path.join(root,'.build/raw-calculator-driver');
const built=spawnSync('xcrun',['swiftc','-swift-version','5','-O',path.join(root,'native/BackgroundTestDriver.swift'),'-o',driver],{encoding:'utf8'});
if(built.status!==0)throw Error(built.stderr||built.stdout);
function proof(){const r=spawnSync(driver,['occlusion',String(pid),String(windowId),String(coverId)],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout)}
function assertCovered(p){assert.equal(p.fullyCovered,true,'Existing window must fully occlude Calculator');assert.notEqual(p.frontPid,pid)}
const client=new Client({name:'raw-key-routing-acceptance',version:'1'});
const operations=[];let trace;let report;
const save=()=>writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
async function call(name,args={}){const r=await client.callTool({name,arguments:args});const value=r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);if(r.isError)throw Error(JSON.stringify(value));return value}
try{
 assertCovered(proof());trace=await startFocusTrace(directory,{seconds:30,targetPID:pid});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/server.mjs')],cwd:root,env:{...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'com.apple.calculator'}}));
 const apps=await call('cu_apps');assert.equal(apps.apps.find(a=>a.pid===pid)?.bundleId,'com.apple.calculator');
 const status=await call('cu_status');assert.equal(status.foregroundEnabled,false);assert.equal(status.inputFocus.keyboardFocusResolved,true);assert.notEqual(status.inputFocus.keyboardPID,pid);
 const before=await call('cu_snapshot',{pid,windowId,screenshot:false});
 for(const key of ['Escape','1','2','SHIFT+8','3','Return']){
   const prior=proof();assertCovered(prior);
   const result=await call('cu_key',{pid,windowId,key,mode:'background'});
   const after=proof();operations.push({key,result,before:prior,after});assertCovered(after);
   assert.equal(result.method,'CGEvent.postToPid');assert.equal(result.inputFocusObservation.keyboardFocusObserved,true);assert.equal(result.inputFocusObservation.targetGainedKeyboardFocus,false);
 }
 const after=await call('cu_snapshot',{pid,windowId,screenshot:false});
 const clean=s=>String(s??'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
 assert.ok(after.nodes.some(n=>n.role==='AXStaticText'&&clean(n.value)==='36'),'Calculator must visibly show 12 × 3 = 36');
 trace.close();await new Promise(resolve=>trace.child.exitCode!==null?resolve():trace.child.once('exit',resolve));
 const observation=JSON.parse(readFileSync(trace.report,'utf8'));
 assert.equal(observation.processTapAvailable,true);assert.equal(observation.tapEnabled,true);
 const keys=observation.processEvents.filter(e=>e.tag===0x43554247&&e.type===10);
 assert.equal(keys.length,6);assert.ok(keys.every(e=>e['40']===pid&&e['41']===status.pid));
 assert.ok(observation.samples.every(s=>s.keyboardFocusResolved&&s.keyboardPID!==pid&&s.foregroundPID!==pid));
 report={status:'raw-key-checks-passed',date:new Date().toISOString(),target:{pid,windowId,coverId},statusMetadata:status,before,after,operations,
  actualRecipientEvidence:{events:keys,sourcePID:status.pid,verifiedResult:'36'},
  observation:{sampleCount:observation.sampleCount,maxSampleGap:observation.maxSampleGap,foregroundPIDs:[...new Set(observation.samples.map(s=>s.foregroundPID))],keyboardPIDs:[...new Set(observation.samples.map(s=>s.keyboardPID))]},
  globalInputGenerated:false,AXActionsGenerated:false,foregroundInputIntegrity:'not tested; no concurrent foreground text generator or human measurement in this run',
  scope:'One existing, fully occluded Calculator window. Not a pass for all background capabilities or arbitrary apps.'};save();console.log('REPORT',path.join(directory,'report.json'));
}catch(error){report={status:'failed',error:error.message,operations};save();throw error}
finally{trace?.close();await client.close()}
