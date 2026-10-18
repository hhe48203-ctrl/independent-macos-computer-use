// Standard MCP -> development helper -> covered editable NSTextView, real events.
import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {startBackgroundFixture} from './background-fixture.mjs';import {startFocusTrace,recordedWindowOrder} from './focus-trace.mjs';
assert.equal(process.env.CU_EXPERIMENTAL_APPKIT_FOCUS,'1','This diagnostic explicitly tests the experimental focus backend');
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'artifacts/raw-document-'+Date.now());mkdirSync(directory,{recursive:true});
const trace=await startFocusTrace(directory,{seconds:75});const client=new Client({name:'raw-document-events-acceptance',version:'1'});let f,received,report={status:'running',operations:[]};
const save=()=>writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
async function call(name,args={}){const r=await client.callTool({name,arguments:args});const value=r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);if(r.isError)throw Object.assign(Error(value.error?.message??JSON.stringify(value)),{code:value.error?.code});const png=r.content.find(c=>c.type==='image');if(png){const file=name+'.png';writeFileSync(path.join(directory,file),Buffer.from(png.data,'base64'));report.images=[...(report.images??[]),file]}return value}
try{
 f=await startBackgroundFixture(directory,{background:true,regular:true,launchServices:true,documentInput:true});
 const target={pid:f.apps.target.pid,windowId:f.apps.target.windowId};const proof=()=>JSON.parse(f.run(f.driver,['occlusion',String(target.pid),String(target.windowId),String(f.apps.cover.windowId)]));assert.equal(proof().fullyCovered,true);
 received=await startFocusTrace(directory+'/recipient',{seconds:60,targetPID:target.pid});
 const serverEntry=process.env.CU_TEST_MCP_SERVER??path.join(root,process.env.CU_TEST_NATIVE_HELPER?'scripts/test-server.mjs':'src/server.mjs');
 const serverEnv={...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.document-target'};if(process.env.CU_TEST_MCP_SERVER)delete serverEnv.NODE_PATH;
 await client.connect(new StdioClientTransport({command:process.execPath,args:[serverEntry],cwd:process.env.CU_TEST_MCP_SERVER?path.dirname(serverEntry):root,env:serverEnv}));
 report.serverEntry=serverEntry;
 report.target=target;report.statusMetadata=await call('cu_status');assert.equal(report.statusMetadata.background.experimentalAppKitFocus,true);
 if(process.env.CU_TEST_DOCUMENT_CAPTURE==='1'){
  const captured=await call('cu_snapshot',{...target,screenshot:true});assert.ok(captured.screenshot&&report.images?.length>0,'Actual MCP PNG image is required');
  const ocr=await call('cu_ocr',target);assert.ok(ocr.lines.some(line=>line.text.includes('Covered background target')),'OCR must read the covered target, not its cover');
  report.perception={screenshot:true,ocr:true,occludedTargetTextVerified:true};
 }
 const snapshot=()=>call('cu_snapshot',{...target,screenshot:false});const doc=s=>s.nodes.find(n=>n.identifier==='scroll-document');
 const before=await snapshot();report.before=before;const original=doc(before).value;
 async function action(name,args){const prior=proof();assert.equal(prior.fullyCovered,true);const result=await call(name,{...target,...args,mode:'background'});const after=proof();report.operations.push({name,args,result,before:prior,after});save();assert.equal(after.fullyCovered,true);return result}
 assert.equal(doc(before).selectedRange.location,0,'Fresh document starts at a known caret so a real movement must change state');
 const down=await action('cu_key',{key:'CMD+Down',strategy:'event'});assert.equal(down.method,'CGEvent.postToPid');
 const prepared=await snapshot(),area=doc(prepared);assert.equal(area.selectedRange.location,original.length);assert.equal(area.selectedRange.length,0);const text='\n真实文档事件 中文🙂 é 👨‍👩‍👧‍👦\n第二行。';
 const typed=await action('cu_type_text',{text,strategy:'event',snapshotId:prepared.snapshotId,elementId:area.id});assert.equal(typed.AXActionsGenerated,false);assert.equal(typed.verified,true);
 let after=await snapshot();assert.equal(doc(after).value,original+text);
 const select=await action('cu_key',{key:'CMD+A',strategy:'event'});assert.equal(select.method,'CGEvent.postToPid');after=await snapshot();assert.equal(doc(after).selectedRange.length,(original+text).length);
 await action('cu_key',{key:'CMD+Up',strategy:'event'});const top=await snapshot(),scroll=top.nodes.find(n=>n.identifier==='scroll-area').frame;
 await action('cu_drag',{fromX:scroll.x+20,fromY:scroll.y+15,toX:scroll.x+250,toY:scroll.y+15,duration:0.3});after=await snapshot();assert.ok(doc(after).selectedRange.length>0);
 const vertical=s=>s.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width).value;const scrollBefore=vertical(after);
 await action('cu_scroll',{x:scroll.x+200,y:scroll.y+50,deltaY:-250});after=await snapshot();assert.ok(vertical(after)>scrollBefore);
 const button=after.nodes.find(n=>n.identifier==='apply-message').frame;await action('cu_click',{x:button.x+button.width/2,y:button.y+button.height/2,strategy:'event'});assert.equal(f.read('target').count,1);
 report.after=await snapshot();assert.equal(doc(report.after).value,original+text);
 for(const t of [received,trace]){t.close();await new Promise(r=>t.child.exitCode!==null?r():t.child.once('exit',r))}
 const o=trace.read(),r=received.read(),order=recordedWindowOrder(o,target.windowId,f.apps.cover.windowId);
 assert.ok(order.recordsCompared>0&&order.violations.length===0);assert.ok(o.samples.every(s=>s.keyboardFocusResolved&&s.keyboardPID!==target.pid&&s.foregroundPID!==target.pid));
 const keys=r.processEvents.filter(e=>e.type===10&&e.tag===0x43554247);assert.ok(keys.length>=4&&keys.every(e=>e['40']===target.pid&&e['41']===report.statusMetadata.pid));
 report={...report,status:'raw-document-events-passed',recordedWindowOrder:order,actualKeyRecipient:keys,observation:{sampleCount:o.sampleCount,maxSampleGap:o.maxSampleGap,keyboardPIDs:[...new Set(o.samples.map(s=>s.keyboardPID))]},scope:'Real Unicode, raw CMD+A/CMD+Down/CMD+Up, mouse click, scroll and text-selection drag in one covered first-party AppKit document. No AX mutation or original CU service. Full foreground-text concurrency and stock-app compatibility remain separate acceptance conditions.'};
}catch(error){report={...report,status:'failed',error:{code:error.code,message:error.message},state:f?.read('target')};process.exitCode=1}
finally{save();received?.close();trace.close();await client.close();f?.close();console.log('REPORT',path.join(directory,'report.json'))}
