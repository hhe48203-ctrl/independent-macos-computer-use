// Existing Calculator or explicitly owned focus-input TextEdit document only.
// No app launch, activation, AX mutation, clipboard or global event generation.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {startFocusTrace,recordedWindowOrder} from './focus-trace.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const [kind,pidArg,windowArg,coverArg]=process.argv.slice(2),pid=Number(pidArg),windowId=Number(windowArg),coverId=Number(coverArg);
assert.ok(['calculator','textedit'].includes(kind)&&[pid,windowId,coverId].every(n=>Number.isSafeInteger(n)&&n>0),'Usage: node scripts/raw-stock-pointer-test.mjs calculator|textedit PID OWNED_WINDOW_ID EXISTING_COVER_ID');
const directory=path.join(root,'artifacts/raw-stock-pointer-'+kind+'-'+Date.now());mkdirSync(directory,{recursive:true});
const driver=path.join(root,'.build/raw-stock-pointer-driver');
const built=spawnSync('xcrun',['swiftc','-swift-version','5','-O',path.join(root,'native/BackgroundTestDriver.swift'),'-o',driver],{encoding:'utf8'});if(built.status!==0)throw Error(built.stderr);
function proof(){const r=spawnSync(driver,['occlusion',String(pid),String(windowId),String(coverId)],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout)}
function covered(){const p=proof();assert.equal(p.fullyCovered,true);assert.notEqual(p.frontPid,pid);return p}
const client=new Client({name:'stock-raw-pointer-acceptance',version:'1'});let trace,report={status:'running',target:{kind,pid,windowId,coverId},operations:[]};
const save=()=>writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
async function call(name,args={}){const r=await client.callTool({name,arguments:args});const v=r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);if(r.isError)throw Error(JSON.stringify(v));return v}
async function action(name,args){const before=covered();const result=await call(name,{pid,windowId,mode:'background',...args});const after=covered();report.operations.push({name,args,result,before,after});save();return result}
const snapshot=()=>call('cu_snapshot',{pid,windowId,screenshot:false});
try{
 covered();trace=await startFocusTrace(directory,{seconds:60,targetPID:pid});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/server.mjs')],cwd:root,env:{...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:kind==='calculator'?'com.apple.calculator':'com.apple.TextEdit'}}));
 const status=await call('cu_status');report.statusMetadata=status;assert.equal(status.foregroundEnabled,false);assert.notEqual(status.inputFocus.keyboardPID,pid);
 report.before=await snapshot();
 if(kind==='calculator'){
  for(const id of ['AllClear','Seven','Multiply','Eight','Equals']){
   const s=await snapshot(),n=s.nodes.find(n=>n.identifier===id);assert.ok(n?.frame);
   const r=await action('cu_click',{x:n.frame.x+n.frame.width/2,y:n.frame.y+n.frame.height/2,strategy:'event'});
   assert.equal(r.method,'window-scoped CGEvent.postToPid');assert.equal(r.pointerDelivery.postedEvents,r.appKitFocusSession?4:2);
  }
  report.after=await snapshot();assert.ok(report.after.nodes.some(n=>String(n.value??'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')==='56'));
 }else{
  assert.match(report.before.window.title,/^focus-input-\d+\.txt$/);
  const area=s=>s.nodes.find(n=>n.role==='AXTextArea');assert.ok(area(report.before));
  await action('cu_key',{key:'CMD+Down',strategy:'event'});
  const added=process.env.CU_STOCK_POINTER_EXISTING_LONG_TEXT==='1'?'\n【系统文档事件 中文🙂 é 👨‍👩‍👧‍👦】\n第二行。':('\n'+Array.from({length:55},(_,i)=>`事件滚动测试 ${String(i).padStart(2,'0')} abcdefghijklmnopqrstuvwxyz`).join('\n'));
  await action('cu_type_text',{text:added,strategy:'event'});
  await action('cu_key',{key:'CMD+Up',strategy:'event'});
  const prepared=await snapshot(),f=area(prepared).frame;
  await action('cu_click',{x:f.x+40,y:f.y+20,strategy:'event'});
  report.afterClick=await snapshot();
  await action('cu_drag',{fromX:f.x+20,fromY:f.y+20,toX:f.x+240,toY:f.y+20,duration:0.3});
  report.afterDrag=await snapshot();assert.ok(area(report.afterDrag).selectedRange.length>0,'Real drag must select text');
  await action('cu_scroll',{x:f.x+200,y:f.y+150,deltaY:-350});
  report.after=await snapshot();
  const vertical=s=>s.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width)?.value;
  assert.ok(vertical(report.after)>vertical(prepared),'Real scroll must advance the document');
  assert.equal(area(report.after).value,area(report.before).value+added,'Pointer operations must preserve text');
 }
 trace.close();await new Promise(r=>trace.child.exitCode!==null?r():trace.child.once('exit',r));const observation=trace.read();
 assert.ok(observation.samples.every(s=>s.keyboardFocusResolved&&s.keyboardPID!==pid&&s.foregroundPID!==pid));
 const pointers=observation.processEvents.filter(e=>[1,2,6].includes(e.type)&&(e.tag&0xffff0000)===0x43420000);
 const order=recordedWindowOrder(observation,windowId,coverId);assert.ok(order.recordsCompared>0&&order.violations.length===0);
 assert.ok(pointers.length>=2);assert.ok(pointers.every(e=>e['40']===pid&&e['41']===status.pid));
 for(const o of report.operations.filter(o=>o.result.pointerDelivery)){const d=o.result.pointerDelivery;assert.equal(d.postedEvents,d.observedEvents);assert.equal(d.postedEvents,d.rewrittenEvents)}
 report={...report,status:'stock-pointer-checks-passed',AXMutationsGenerated:false,globalInputGenerated:false,actualRecipientEvidence:pointers,recordedWindowOrder:order,observation:{sampleCount:observation.sampleCount,maxSampleGap:observation.maxSampleGap,keyboardPIDs:[...new Set(observation.samples.map(s=>s.keyboardPID))]},scope:'Operation phase only: one existing, owned, fully occluded stock window. No foreground text integrity measurement or claim about quiet app launch.'};save();console.log('REPORT',path.join(directory,'report.json'));
}catch(error){report={...report,status:'failed',error:error.message};save();console.error('REPORT',path.join(directory,'report.json'));throw error}
finally{trace?.close();await client.close()}
