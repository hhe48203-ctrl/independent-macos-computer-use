// pi -> standard stdio MCP -> independent helper -> a new covered AppKit document.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Bridge} from '../src/bridge.mjs';
import {startBackgroundFixture} from './background-fixture.mjs';
import {startFocusTrace,recordedWindowOrder} from './focus-trace.mjs';
import {nativeMcpResult} from './pi-result.mjs';
assert.equal(process.env.CU_EXPERIMENTAL_APPKIT_FOCUS,'1','Explicitly opt into this experimental background-event test');
const root=fileURLToPath(new URL('../',import.meta.url)),stamp=Date.now();
const directory=path.join(root,'artifacts/pi-document-'+stamp),work=path.join(root,'.build/pi-document-'+stamp);mkdirSync(directory,{recursive:true});mkdirSync(work,{recursive:true});
const bundle='io.local.computeruse.document-target',env={...process.env,CU_ALLOWED_BUNDLE_IDS:bundle,CU_ENABLE_FOREGROUND:'0',CU_EXPERIMENTAL_APPKIT_FOCUS:'1'};
// Encoding edge cases are checked with exact literals in raw-document-test.
// Here the agent must copy a short ordinary Unicode suffix without escapes.
const text='【pi独立文档 中文🙂】';let fixture,recipient,trace,report={status:'running'};
const save=()=>writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
async function finishTrace(t){t.close();await new Promise(r=>t.child.exitCode!==null?r():t.child.once('exit',r));return t.read()}
try{
 trace=await startFocusTrace(directory,{seconds:180});
 fixture=await startBackgroundFixture(directory,{background:true,regular:true,launchServices:true,documentInput:true});
 const target={pid:fixture.apps.target.pid,windowId:fixture.apps.target.windowId},coverId=fixture.apps.cover.windowId;
 const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(coverId)]));
 const snapshot=async()=>{const b=new Bridge({env});try{return await b.request('snapshot',{...target,screenshot:false})}finally{b.close();await b.retiring}};
 const before=await snapshot(),document=s=>s.nodes.find(n=>n.identifier==='scroll-document');assert.equal(proof().fullyCovered,true);assert.equal(document(before).selectedRange.location,0);
 recipient=await startFocusTrace(directory+'/recipient',{seconds:180,targetPID:target.pid});
 const command=process.env.PI_COMMAND??'pi';
 const registration=spawnSync(command,['mcp','add','macos_computer_use','--local','--cwd',root,'--exposure','direct','--env','CU_ALLOWED_BUNDLE_IDS='+bundle,'--env','CU_ENABLE_FOREGROUND=0','--env','CU_EXPERIMENTAL_APPKIT_FOCUS=1','--',process.execPath,path.join(root,'src/server.mjs')],{cwd:work,encoding:'utf8'});
 assert.equal(registration.status,0,registration.stderr||registration.stdout);
 const prompt=`Use only the macos_computer_use MCP tools. Operate only our disposable fully covered AppKit document: pid ${target.pid}, windowId ${target.windowId}. Keep it covered and in background. Every mutation must explicitly use mode background. All keys must use strategy event, all text and clicks must use strategy event. Never use AX mutations, clipboard, cu_focus, cu_launch, cu_ax_action, cu_select_text, foreground mode, shell or other apps. Stop on any tool error; never repeat a mutation after an error.
Perform this bounded sequence, observing fresh cu_snapshot with screenshot:false after each state change:
1. Check cu_status then snapshot. The editable AXTextArea identifier scroll-document begins with its caret at 0.
2. Send raw CMD+Down. Verify the selection moved to the exact end of the existing document.
3. Use that fresh snapshotId and scroll-document elementId to append exactly ${JSON.stringify(text)} with cu_type_text strategy event. Do not include the enclosing quotation marks. Verify the complete original text plus this exact suffix.
4. Send raw CMD+A and snapshot to verify the full document selectedRange.length. Then send raw CMD+Up and snapshot.
5. Use the fresh scroll-area frame to cu_drag from x+20,y+15 to x+250,y+15, duration0.3. Snapshot and verify a nonempty selected range.
6. cu_scroll at scroll-area x+200,y+50, deltaY:-250. Snapshot to verify the vertical scrollbar increased.
7. Coordinate cu_click the center of the apply-message button using strategy event. Snapshot to verify Result ends with [1] and document text is unchanged. Report the observed result. Do not do any extra mutations.`;
 const child=spawn(command,['--print','--mode','json','--no-session','--approve','--no-extensions','--extension','builtin:mcp','--no-skills','--no-prompt-templates','--no-themes','--no-context-files','--no-builtin-tools','--tools','mcp__macos_computer_use__*',prompt],{cwd:work,stdio:['ignore','pipe','pipe']});
 const output=[],stderr=[];child.stdout.on('data',b=>output.push(b));child.stderr.on('data',b=>stderr.push(b));
 const timeout=setTimeout(()=>child.kill('SIGTERM'),150000);
 const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});clearTimeout(timeout);
 const raw=Buffer.concat(output).toString();writeFileSync(path.join(directory,'events.jsonl'),raw);writeFileSync(path.join(directory,'stderr.log'),Buffer.concat(stderr));
 const events=raw.split('\n').filter(Boolean).flatMap(s=>{try{return[JSON.parse(s)]}catch{return[]}});
 const calls=events.filter(e=>e.type==='tool_execution_start'),completed=events.filter(e=>e.type==='tool_execution_end');
 const after=await snapshot(),afterProof=proof(),received=await finishTrace(recipient),observed=await finishTrace(trace);
 const allowed=['cu_status','cu_snapshot','cu_key','cu_type_text','cu_drag','cu_scroll','cu_click'].map(n=>'mcp__macos_computer_use__'+n);
 const mutations=calls.filter(e=>!['mcp__macos_computer_use__cu_status','mcp__macos_computer_use__cu_snapshot'].includes(e.toolName));
 const textResults=completed.filter(e=>e.toolName.endsWith('__cu_type_text')).map(e=>nativeMcpResult(e.result));
 const status=nativeMcpResult(completed.find(e=>e.toolName.endsWith('__cu_status'))?.result),source=status?.pid;
 const snapshots=completed.filter(e=>e.toolName.endsWith('__cu_snapshot')).map(e=>nativeMcpResult(e.result));
 const expected=document(before).value+text,selectionLengths=snapshots.map(s=>document(s)?.selectedRange?.length);
 const order=recordedWindowOrder(observed,target.windowId,coverId),keys=received.processEvents.filter(e=>e.type===10&&e.tag===0x43554247);
 report={status:'validating',exitCode,target,coverId,text,before,after,afterProof,toolCalls:calls.map(e=>({name:e.toolName,args:e.args})),toolErrors:completed.filter(e=>e.isError).map(e=>({name:e.toolName,result:e.result})),actualRecipientEvidence:{sourcePID:source,keyDown:keys},recordedWindowOrder:order,selectionLengths,fixtureState:fixture.read('target'),observation:{sampleCount:observed.sampleCount,maxSampleGap:observed.maxSampleGap,keyboardPIDs:[...new Set(observed.samples.map(s=>s.keyboardPID))]},foregroundInputIntegrity:'Not tested in this run',scope:'pi uses only our standard stdio MCP tools for real keys, Unicode, click, selection drag and scroll in a newly launched covered first-party AppKit document; the original CU service is not used. Experimental local focus is explicitly enabled.'};save();
 assert.equal(exitCode,0);assert.ok(calls.every(e=>allowed.includes(e.toolName)));assert.ok(completed.every(e=>!e.isError));
 assert.equal(mutations.length,7);assert.ok(mutations.every(e=>e.args.pid===target.pid&&e.args.windowId===target.windowId&&e.args.mode==='background'));
 assert.ok(mutations.filter(e=>/__(cu_key|cu_type_text|cu_click)$/.test(e.toolName)).every(e=>e.args.strategy==='event'));
 assert.equal(textResults.length,1);assert.ok(textResults[0].verified&&textResults[0].AXActionsGenerated===false);assert.equal(document(after).value,expected);
 assert.ok(selectionLengths.includes(expected.length));assert.ok(selectionLengths.some(n=>n>0&&n<expected.length));
 assert.equal(report.fixtureState.count,1);assert.equal(afterProof.fullyCovered,true);
 const vertical=s=>s.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width)?.value;assert.ok(vertical(after)>vertical(before));
 assert.ok(keys.length>=4&&keys.every(e=>e['40']===target.pid&&e['41']===source));
 assert.ok(order.recordsCompared>0&&order.violations.length===0);assert.ok(observed.samples.length>0&&observed.samples.every(s=>s.keyboardFocusResolved&&s.keyboardPID!==target.pid&&s.foregroundPID!==target.pid));
 report.status='passed';save();console.log('REPORT',path.join(directory,'report.json'));
}catch(error){report={...report,status:'failed',error:{code:error.code,message:error.message}};save();console.error('REPORT',path.join(directory,'report.json'));process.exitCode=1}
finally{trace?.close();recipient?.close();fixture?.close()}
