import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {connectRepl,parseAX} from './repl-client.mjs';
import {startBackgroundFixture} from './background-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=root+`artifacts/repl-document-${Date.now()}`;mkdirSync(directory,{recursive:true});
const fixture=await startBackgroundFixture(directory,{background:true,documentInput:true});const target=fixture.apps.target;
const env={...process.env,CU_ENABLE_FOREGROUND:'0',CU_EXPERIMENTAL_APPKIT_FOCUS:'1',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.document-target'};
const server=process.env.CU_TEST_SERVER??root+'src/server.mjs',cwd=process.env.CU_TEST_CWD??root;
delete env.NODE_PATH;
const repl=await connectRepl(env,server,cwd);let report={status:'running',server,cwd};
const observe=async()=>parseAX(await repl.evaluate('app.getAXState({emit:false,disableDiffing:true})'));
const document=s=>s.nodes.find(n=>n.identifier==='scroll-document');
const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(fixture.apps.cover.windowId)]));
try{
  await repl.evaluate(`(async()=>{globalThis.app=await cua.getApp({pid:${target.pid},windowId:${target.windowId}});return {pid:app.pid,windowId:app.windowId}})()`);
  const before=await observe(),initial=document(before).value,beforeProof=proof();assert.equal(beforeProof.fullyCovered,true);
  await repl.evaluate('app.pressKey("CMD+Down",{strategy:"event"})');assert.equal(document(await observe()).selectedRange.location,initial.length);
  await repl.evaluate('app.move([30,220])');
  const suffix='【REPL真实输入 中文🙂 é 👩‍💻】';const typed=await repl.evaluate(`app.typeText(${JSON.stringify(suffix)},{strategy:'event'})`);assert.equal(typed.AXActionsGenerated,false);assert.equal(typed.verified,true);
  const typingCursor=await repl.evaluate('cua.cursorState()');
  const approach=typingCursor.history.filter(p=>p.activity==='type'&&p.moving);
  assert.ok(approach.length>=8);assert.ok(approach.every(p=>p.time<=typed.appKitFocusSession.startedEpoch),'cursor approach must finish before the synthetic app-local focus scope starts');
  const expected=initial+suffix;assert.equal(document(await observe()).value,expected);
  await repl.evaluate('app.pressKey("CMD+A",{strategy:"event"})');assert.equal(document(await observe()).selectedRange.length,expected.length);
  await repl.evaluate('app.pressKey("CMD+Up",{strategy:"event"})');const top=await observe(),frame=top.nodes.find(n=>n.identifier==='scroll-area').frame;
  await repl.evaluate(`app.drag([${frame.x+20},${frame.y+15}],[${frame.x+250},${frame.y+15}],{duration:0.35})`);assert.ok(document(await observe()).selectedRange.length>0);
  await repl.evaluate(`app.scroll([${frame.x+200},${frame.y+50}],'down',0.6)`);
  const latest=await observe(),button=latest.nodes.find(n=>n.identifier==='apply-message');await repl.evaluate(`app.click(${button.id},{strategy:'event'})`);
  const after=await observe();assert.equal(document(after).value,expected);assert.equal(fixture.read('target').count,1);
  const vertical=s=>s.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width)?.value;assert.ok(vertical(after)>vertical(before));
  const afterProof=proof();assert.equal(afterProof.fullyCovered,true);assert.notEqual(afterProof.frontPid,target.pid);
  const captured=await repl.client.callTool({name:'js',arguments:{code:'await app.getScreenshot(); undefined'}});assert.ok(!captured.isError);const image=captured.content.find(c=>c.type==='image');assert.ok(image);const bytes=Buffer.from(image.data,'base64');assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));writeFileSync(directory+'/target.png',bytes);
  const captureMetadata=JSON.parse(captured.content.find(c=>c.type==='text'&&c.text.startsWith('{')).text);
  const ocr=await repl.evaluate('app.ocr({emit:false})');assert.ok(ocr.lines.some(line=>/Apply message/i.test(line.text)),'Vision must recognize a real control label in the captured covered window');
  report={...report,date:new Date().toISOString(),status:'passed',target:{pid:target.pid,windowId:target.windowId},suffix,typed,beforeProof,afterProof,beforeDocument:document(before),afterDocument:document(after),fixture:fixture.read('target'),capture:{...captureMetadata,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},ocr,cursor:await repl.evaluate('cua.cursorState()'),scope:'Fresh accessory AppKit document; only js/js_reset public entry points. Real process-directed keys/Unicode/click, text-selection drag and scroll; no AX mutation for these input operations. ScreenCaptureKit rich PNG and local Vision OCR verified.'};
}catch(error){report={...report,status:'failed',error:error.message};process.exitCode=1;}
finally{writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));writeFileSync(directory+'/calls.json',JSON.stringify(repl.calls,null,2));await repl.client.close();fixture.close();console.log('REPORT',directory+'/report.json',report.status,report.error??'');}
