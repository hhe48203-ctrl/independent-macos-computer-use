import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {startBackgroundFixture} from './background-fixture.mjs';
import {connectRepl,parseAX} from './repl-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),stamp=Date.now(),directory=root+`artifacts/pi-repl-document-${stamp}`,work=root+`.build/pi-repl-document-${stamp}`;mkdirSync(directory,{recursive:true});mkdirSync(work,{recursive:true});
const fixture=await startBackgroundFixture(directory,{background:true,documentInput:true}),target=fixture.apps.target;
const env={...process.env,CU_ENABLE_FOREGROUND:'0',CU_EXPERIMENTAL_APPKIT_FOCUS:'0',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.document-target'};
const probe=await connectRepl(env);const suffix='【pi REPL 中文🙂】';let report={status:'running'};
const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(fixture.apps.cover.windowId)]));
const observe=async()=>parseAX(await probe.evaluate('app.getAXState({emit:false,disableDiffing:true})'));
const document=s=>s.nodes.find(n=>n.identifier==='scroll-document');
try{
  await probe.evaluate(`(async()=>{globalThis.app=await cua.getApp({pid:${target.pid},windowId:${target.windowId}});return true})()`);
  const before=await observe(),beforeProof=proof();assert.equal(beforeProof.fullyCovered,true);assert.equal(document(before).selectedRange.location,0);
  const command=process.env.PI_COMMAND??'pi';
  const registration=spawnSync(command,['mcp','add','macos_computer_use','--local','--cwd',root,'--exposure','direct','--env','CU_ENABLE_FOREGROUND=0','--env','CU_EXPERIMENTAL_APPKIT_FOCUS=0','--env','CU_ALLOWED_BUNDLE_IDS=io.local.computeruse.document-target','--',process.execPath,root+'src/server.mjs'],{cwd:work,encoding:'utf8'});assert.equal(registration.status,0,registration.stderr);
  const prompt=`Use only macos_computer_use js/js_reset MCP tools. No imports, filesystem, shell, clipboard, foreground control, direct AX mutations (use only the specified high-level methods), other tools or other apps. Operate only our disposable covered AppKit document pid ${target.pid},windowId ${target.windowId}. Stop on any error; do not retry mutations.
Bind let app=await cua.getApp({pid:${target.pid},windowId:${target.windowId}}), read its documentation and AX state. Preserve this same variable across at least 3 js calls. Use AX observations only, no screenshots in this test (therefore coordinates stay logical window points). Perform exactly these 7 background operations without synthetic AppKit activation, observing after each:
1. app.pressKey('CMD+Down',{strategy:'event'}). Verify scroll-document selectedRange is at the exact end.
2. app.typeText(${JSON.stringify(suffix)},{strategy:'event'}). Verify original text plus this exact suffix.
3. app.pressKey('CMD+A'). Verify full document selected.
4. app.pressKey('CMD+Up',{strategy:'event'}).
5. Use app.selectText(the latest scroll-document index,'Scrollable row 1 — background text'). Verify that exact nonempty selection. Do not use a raw drag for text selection.
6. app.scroll([scroll-area x+200,y+50],'down',0.6). Verify vertical scroll value increased.
7. app.click(the latest observed apply-message numeric index). Verify Result ends in [1] and the document remains original text plus suffix. Read cua.cursorState() and report the actual result. Do not perform any additional mutations.`;
  const child=spawn(command,['--print','--mode','json','--no-session','--approve','--no-extensions','--extension','builtin:mcp','--no-skills','--no-prompt-templates','--no-themes','--no-context-files','--no-builtin-tools','--tools','mcp__macos_computer_use__*',prompt],{cwd:work,stdio:['ignore','pipe','pipe']});const chunks=[],errors=[];child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>errors.push(b));
  const timer=setTimeout(()=>child.kill('SIGTERM'),180000);const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});clearTimeout(timer);
  const output=Buffer.concat(chunks).toString();writeFileSync(directory+'/events.jsonl',output);writeFileSync(directory+'/stderr.log',Buffer.concat(errors));
  const events=output.split('\n').filter(Boolean).flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}}),calls=events.filter(e=>e.type==='tool_execution_start'),completed=events.filter(e=>e.type==='tool_execution_end');
  const after=await observe(),afterProof=proof(),actual=fixture.read('target'),received=fixture.read('target','events');
  report={date:new Date().toISOString(),status:'validating',exitCode,target:{pid:target.pid,windowId:target.windowId},beforeProof,afterProof,suffix,before:document(before),after:document(after),toolCalls:calls.map(c=>({name:c.toolName,args:c.args})),toolErrors:completed.filter(e=>e.isError),fixture:actual,realKeyDown:received.filter(e=>e.type===10).map(e=>({keyCode:e.keyCode,flags:e.flags})),scope:'Only js public tools; pi preserves its app object and performs real navigation/Unicode/scroll with semantic select-all, text selection and button press in a covered first-party document. No foreground draft reads.'};
  assert.equal(exitCode,0);assert.ok(calls.length>=3&&calls.every(c=>c.toolName==='mcp__macos_computer_use__js'));assert.equal(report.toolErrors.length,0);
  assert.equal(document(after).value,document(before).value+suffix);assert.equal(actual.count,1);assert.equal(afterProof.fullyCovered,true);assert.ok(report.realKeyDown.length>=3);
  const vertical=s=>s.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width)?.value;assert.ok(vertical(after)>vertical(before));assert.ok(document(after).selectedRange.length>0);
  report.status='passed';
}catch(error){report={...report,status:'failed',error:error.message};process.exitCode=1;}
finally{writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));await probe.client.close();fixture.close();console.log('PI_REPL_REPORT',directory+'/report.json',report.status,report.error??'');}
