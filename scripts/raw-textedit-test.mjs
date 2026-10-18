// Explicit existing disposable TextEdit target; never launches or activates apps.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {startFocusTrace} from './focus-trace.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const [pid,windowId,coverId]=process.argv.slice(2).map(Number);
if(![pid,windowId,coverId].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Usage: node scripts/raw-textedit-test.mjs TEXTEDIT_PID OWNED_FOCUS_INPUT_WINDOW_ID EXISTING_COVER_ID');
const directory=path.join(root,'artifacts/raw-textedit-'+Date.now());mkdirSync(directory,{recursive:true});
const driver=path.join(root,'.build/raw-textedit-driver');
const built=spawnSync('xcrun',['swiftc','-swift-version','5','-O',path.join(root,'native/BackgroundTestDriver.swift'),'-o',driver],{encoding:'utf8'});
if(built.status!==0)throw Error(built.stderr);
function proof(){const r=spawnSync(driver,['occlusion',String(pid),String(windowId),String(coverId)],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout)}
const client=new Client({name:'raw-unicode-routing-acceptance',version:'1'});
let trace,report={status:'running',operations:[]};
const save=()=>writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
async function call(name,args={}){const r=await client.callTool({name,arguments:args});const v=r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);if(r.isError)throw Error(JSON.stringify(v));return v}
try{
 assert.equal(proof().fullyCovered,true);trace=await startFocusTrace(directory,{seconds:30,targetPID:pid});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/server.mjs')],cwd:root,env:{...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'com.apple.TextEdit'}}));
 const status=await call('cu_status');assert.equal(status.foregroundEnabled,false);assert.notEqual(status.inputFocus.keyboardPID,pid);
 const apps=await call('cu_apps');assert.equal(apps.apps.find(a=>a.pid===pid)?.bundleId,'com.apple.TextEdit');
 const before=await call('cu_snapshot',{pid,windowId,screenshot:false});assert.match(before.window.title,/^focus-input-\d+\.txt$/);
 const original=before.nodes.find(n=>n.role==='AXTextArea')?.value;assert.equal(typeof original,'string');
 const key=await call('cu_key',{pid,windowId,key:'CMD+Down',mode:'background'});report.operations.push({tool:'cu_key',result:key,proof:proof()});save();assert.equal(key.method,'CGEvent.postToPid');
 const prepared=await call('cu_snapshot',{pid,windowId,screenshot:false});const area=prepared.nodes.find(n=>n.role==='AXTextArea');assert.ok(area);
 const text='【标准MCP 中文🙂 é 👨‍👩‍👧‍👦】\n第二行：真实Unicode事件。';
 const args={pid,windowId,snapshotId:prepared.snapshotId,elementId:area.id,text,strategy:'event',mode:'background'};
 const result=await call('cu_type_text',args);report.operations.push({tool:'cu_type_text',args,result,proof:proof()});save();
 assert.equal(result.method,'Unicode CGEvent.postToPid');assert.equal(result.verified,true);assert.equal(result.AXActionsGenerated,false);
 const after=await call('cu_snapshot',{pid,windowId,screenshot:false});assert.equal(after.nodes.find(n=>n.role==='AXTextArea')?.value,original+text);
 assert.ok(report.operations.every(o=>o.proof.fullyCovered&&o.result.inputFocusObservation.keyboardFocusObserved&&!o.result.inputFocusObservation.targetGainedKeyboardFocus&&!o.result.inputFocusObservation.unexpectedKeyboardRecipient));
 trace.close();await new Promise(resolve=>trace.child.exitCode!==null?resolve():trace.child.once('exit',resolve));const observation=trace.read();
 const keys=observation.processEvents.filter(e=>e.tag===0x43554247&&e.type===10);
 assert.equal(keys.length,result.packets+1);assert.ok(keys.every(e=>e['40']===pid&&e['41']===status.pid));
 assert.ok(observation.samples.every(s=>s.keyboardFocusResolved&&s.keyboardPID!==pid&&s.foregroundPID!==pid));
 report={...report,status:'raw-unicode-checks-passed',date:new Date().toISOString(),target:{pid,windowId,coverId},statusMetadata:status,before,after,
  actualRecipientEvidence:{sourcePID:status.pid,events:keys},observation:{sampleCount:observation.sampleCount,maxSampleGap:observation.maxSampleGap,keyboardPIDs:[...new Set(observation.samples.map(s=>s.keyboardPID))],foregroundPIDs:[...new Set(observation.samples.map(s=>s.foregroundPID))]},
  AXActionsGenerated:false,globalInputGenerated:false,foregroundInputIntegrity:'not tested in this run',scope:'Raw Unicode and CMD+Down in one explicitly owned, already-focused, completely occluded TextEdit window; no original CU service calls.'};save();console.log('REPORT',path.join(directory,'report.json'));
}catch(error){report={...report,status:'failed',error:error.message};save();throw error}
finally{trace?.close();await client.close()}
