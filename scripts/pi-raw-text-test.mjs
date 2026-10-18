import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Bridge} from '../src/bridge.mjs';
import {startFocusTrace} from './focus-trace.mjs';
import {nativeMcpResult} from './pi-result.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const [pid,windowId,coverId]=process.argv.slice(2).map(Number);
if(![pid,windowId,coverId].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Usage: node scripts/pi-raw-text-test.mjs TEXTEDIT_PID OWNED_FOCUS_INPUT_WINDOW_ID EXISTING_COVER_ID');
const directory=path.join(root,'artifacts/pi-raw-text-'+Date.now());mkdirSync(directory,{recursive:true});
const work=path.join(root,'.build/pi-raw-text-workspace');mkdirSync(work,{recursive:true});
const driver=path.join(root,'.build/pi-raw-text-driver');
const compile=spawnSync('xcrun',['swiftc','-swift-version','5','-O',path.join(root,'native/BackgroundTestDriver.swift'),'-o',driver],{encoding:'utf8'});if(compile.status!==0)throw Error(compile.stderr);
function proof(){const r=spawnSync(driver,['occlusion',String(pid),String(windowId),String(coverId)],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return JSON.parse(r.stdout)}
async function snapshot(){const b=new Bridge();try{return await b.request('snapshot',{pid,windowId,screenshot:false})}finally{b.close()}}
const value=s=>s.nodes.find(n=>n.role==='AXTextArea')?.value;
const before=await snapshot();assert.match(before.window.title,/^focus-input-\d+\.txt$/);assert.equal(proof().fullyCovered,true);
const text='【pi真实事件：中文🙂】';const trace=await startFocusTrace(directory,{seconds:180,targetPID:pid});let report;
try{
 const command=process.env.PI_COMMAND??'pi';
 const registration=spawnSync(command,['mcp','add','macos_computer_use','--local','--cwd',root,'--exposure','direct','--env','CU_ALLOWED_BUNDLE_IDS=com.apple.TextEdit','--env','CU_ENABLE_FOREGROUND=0','--',process.execPath,path.join(root,'src/server.mjs')],{cwd:work,encoding:'utf8'});
 if(registration.status!==0)throw Error(registration.stderr||registration.stdout);
 const prompt=`Use only the macos_computer_use MCP tools. This authorizes input only in the existing disposable TextEdit window pid ${pid}, windowId ${windowId}, title ${before.window.title}. It is completely covered and must stay in the background. Check cu_status, then take cu_snapshot with screenshot:false. Send cu_key with key CMD+Down and mode background to move to the end of this document. Take a fresh snapshot and use the observed AXTextArea element reference with cu_type_text, strategy event, mode background, to append exactly ${JSON.stringify(text)}. Verify with a fresh AX snapshot and report success. Do not use cu_focus, cu_launch, cu_ax_action, cu_select_text, clipboard, AX text strategy, foreground mode, bash, files, scripts or other applications. Do not repeat a mutation if it reports an error; stop and report the error.`;
 const args=['--print','--mode','json','--no-session','--approve','--no-extensions','--extension','builtin:mcp','--no-skills','--no-prompt-templates','--no-themes','--no-context-files','--no-builtin-tools','--tools','mcp__macos_computer_use__*',prompt];
 const child=spawn(command,args,{cwd:work,stdio:['ignore','pipe','pipe']});const out=[],err=[];
 child.stdout.on('data',d=>out.push(d));child.stderr.on('data',d=>err.push(d));
 const timeout=setTimeout(()=>child.kill('SIGTERM'),150000);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});clearTimeout(timeout);
 const output=Buffer.concat(out).toString();writeFileSync(path.join(directory,'events.jsonl'),output);writeFileSync(path.join(directory,'stderr.log'),Buffer.concat(err));
 const events=output.split('\n').filter(Boolean).flatMap(l=>{try{return[JSON.parse(l)]}catch{return[]}});
 const calls=events.filter(e=>e.type==='tool_execution_start');const completed=events.filter(e=>e.type==='tool_execution_end');
 const after=await snapshot();const afterProof=proof();
 trace.close();await new Promise(resolve=>trace.child.exitCode!==null?resolve():trace.child.once('exit',resolve));const observation=trace.read();
 const forbidden=calls.filter(e=>!['cu_status','cu_apps','cu_windows','cu_snapshot','cu_key','cu_type_text'].some(n=>e.toolName==='mcp__macos_computer_use__'+n));
 const textCalls=calls.filter(e=>e.toolName.endsWith('__cu_type_text'));
 const textResults=completed.filter(e=>e.toolName.endsWith('__cu_type_text')).map(e=>nativeMcpResult(e.result));
 const source=nativeMcpResult(completed.find(e=>e.toolName.endsWith('__cu_status'))?.result)?.pid;
 const received=observation.processEvents.filter(e=>e.tag===0x43554247&&e.type===10);
 const mutations=calls.filter(e=>e.toolName.endsWith('__cu_key')||e.toolName.endsWith('__cu_type_text'));
 const success=code===0&&forbidden.length===0&&completed.every(e=>!e.isError)&&mutations.every(e=>e.args.pid===pid&&e.args.windowId===windowId&&e.args.mode==='background')&&textCalls.length===1&&textCalls[0].args.strategy==='event'&&textCalls[0].args.mode==='background'&&textResults.length===1&&textResults.every(r=>r?.verified&&r?.AXActionsGenerated===false&&r?.method==='Unicode CGEvent.postToPid')&&value(after)===value(before)+text&&afterProof.fullyCovered&&received.length>=2&&received.every(e=>e['40']===pid&&e['41']===source)&&observation.sampleCount>0&&observation.samples.every(s=>s.keyboardFocusResolved&&s.keyboardPID!==pid&&s.foregroundPID!==pid);
 report={status:success?'passed':'failed',exitCode:code,target:{pid,windowId,coverId},text,calls:calls.map(e=>({name:e.toolName,args:e.args})),toolErrors:completed.filter(e=>e.isError).map(e=>({name:e.toolName,result:e.result})),before,after,afterProof,actualRecipientEvidence:{sourcePID:source,events:received},observation:{sampleCount:observation.sampleCount,maxSampleGap:observation.maxSampleGap,keyboardPIDs:[...new Set(observation.samples.map(s=>s.keyboardPID))],foregroundPIDs:[...new Set(observation.samples.map(s=>s.foregroundPID))]},foregroundInputIntegrity:'not tested in this run',scope:'pi invokes the independent stdio MCP server for real Unicode events, without original CU service, AX mutations or foreground setup.'};
 writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,calls:report.calls.map(c=>c.name),report:path.join(directory,'report.json')}));assert.equal(success,true,'pi must append exact text through event strategy');
}catch(error){if(!report)writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:error.message},null,2));throw error}
finally{trace.close()}
