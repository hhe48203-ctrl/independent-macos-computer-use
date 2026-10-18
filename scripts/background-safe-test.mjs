// No activation, global input, synthetic foreground traffic, raw clicks or drags.
import assert from 'node:assert/strict';
import{Client}from'@modelcontextprotocol/sdk/client/index.js';import{StdioClientTransport}from'@modelcontextprotocol/sdk/client/stdio.js';
import{mkdirSync,writeFileSync,readFileSync}from'node:fs';import path from'node:path';import{fileURLToPath}from'node:url';
import{startBackgroundFixture}from'./background-fixture.mjs';
import{startFocusTrace}from'./focus-trace.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const directory=path.join(root,'artifacts/background-safe-'+Date.now());mkdirSync(directory,{recursive:true});
let beforeLaunch;
const focusTrace=await startFocusTrace(directory,{seconds:120});
let fixture;try{fixture=await startBackgroundFixture(directory,{background:true,beforeLaunch({driver,run}){beforeLaunch=JSON.parse(run(driver,['occlusion','1','0','0']))}})}catch(error){focusTrace.close();throw error}
const client=new Client({name:'nonactivating-background-acceptance',version:'0.2.0'});
const t={pid:fixture.apps.target.pid,windowId:fixture.apps.target.windowId},cover=fixture.apps.cover.windowId;
const checks=[],operations=[],limitations=[];let image=0;const start=Date.now()/1000;
const save=(name,value)=>writeFileSync(path.join(directory,name+'.json'),JSON.stringify(value,null,2));
function proof(target,coverId){return JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(coverId)]))}
async function call(name,args={}){const r=await client.callTool({name,arguments:args});const v=r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);if(r.isError)throw Error(`${name}: ${JSON.stringify(v)}`);const png=r.content.find(c=>c.type==='image');if(png)writeFileSync(path.join(directory,`${++image}-${name}.png`),Buffer.from(png.data,'base64'));return v}
async function bg(name,args,target=t,coverId=cover){const before=proof(target,coverId);assert.equal(before.fullyCovered,true);assert.notEqual(before.frontPid,target.pid);const result=await call(name,args);const after=proof(target,coverId);operations.push({name,args,before,after,result});assert.equal(after.fullyCovered,true);assert.notEqual(after.frontPid,target.pid);return result}
const ref=(s,n)=>({snapshotId:s.snapshotId,elementId:n.id});const byId=(s,id)=>s.nodes.find(n=>n.identifier===id);const text=s=>s.nodes.find(n=>n.role==='AXTextArea');
const check=name=>{checks.push(name);console.log('PASS',name)};
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/server.mjs')],cwd:root,env:{...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target,io.local.computeruse.foreground-workspace,com.apple.TextEdit,com.apple.calculator'}}));
 const status=await call('cu_status');assert.equal(status.foregroundEnabled,false);assert.ok(status.permissions.accessibility&&status.permissions.screenRecording);check('foreground control disabled in native backend');
 assert.notEqual(proof(t,cover).frontPid,t.pid);assert.notEqual(proof(t,cover).frontPid,fixture.apps.cover.pid);check('fixture creation and relative window ordering did not activate test apps');
 let s=await bg('cu_snapshot',t);save('fixture-before',s);assert.equal(s.app.active,false);assert.ok(s.nodes.some(n=>n.value==='Covered background target'));check('fully covered window AX + independent PNG');
 const ocr=await bg('cu_ocr',t);assert.ok(ocr.lines.some(n=>n.text.includes('Covered background target')));check('OCR captures target rather than its cover');
 await bg('cu_type_text',{...t,...ref(s,byId(s,'message-input')),text:'quiet 后台 中文 🧪'});assert.equal(fixture.read('target').input,'quiet 后台 中文 🧪');check('verified Unicode AX insertion under occlusion');
 const button=byId(s,'apply-message');await bg('cu_click',{...ref(s,button),strategy:'ax'});assert.ok(fixture.read('target').result.includes('quiet 后台 中文 🧪'));assert.equal(fixture.read('target').count,1);check('semantic button click read back under occlusion');
 await bg('cu_click',{...t,x:button.frame.x+button.frame.width/2,y:button.frame.y+button.frame.height/2,strategy:'ax'});assert.equal(fixture.read('target').count,2);check('coordinate resolved within exact window AX tree');
 await bg('cu_select_text',{...ref(s,byId(s,'message-input')),text:'中文'});await bg('cu_type_text',{...t,...ref(s,byId(s,'message-input')),text:'已验证'});assert.equal(fixture.read('target').input,'quiet 后台 已验证 🧪');check('UTF-16 selection and replacement in inactive text control');
 const beforeScroll=s.nodes.find(n=>n.role==='AXScrollBar').value;await bg('cu_scroll',{...t,x:150,y:420,deltaY:-250});s=await bg('cu_snapshot',t);save('fixture-after',s);assert.ok(s.nodes.find(n=>n.role==='AXScrollBar').value>beforeScroll);check('process/window-directed scroll changes real NSScrollView');
 if(process.env.CU_TEST_EXISTING_TARGETS){
  const previous=JSON.parse(readFileSync(process.env.CU_TEST_EXISTING_TARGETS,'utf8')).targets;
  const calc=previous.calculator,edit=previous.textedit;
  // Only reuse the exact owned test windows provided by the prior report. Never launch/focus/layout stock apps.
  if(proof(calc,edit.windowId).fullyCovered){
   for(const key of['all-clear','seven','multiply','eight','equals']){const snap=await bg('cu_snapshot',{...calc,screenshot:false},calc,edit.windowId);const labels={'all-clear':['All Clear','Clear'],seven:['7'],multiply:['Multiply','×'],eight:['8'],equals:['Equals','=']};const n=snap.nodes.find(n=>n.identifier===key)??snap.nodes.find(n=>n.role==='AXButton'&&labels[key].includes(n.label??n.title??n.value));assert.ok(n);await bg('cu_click',{...ref(snap,n),strategy:'ax'},calc,edit.windowId)}
   const snap=await bg('cu_snapshot',calc,calc,edit.windowId);save('calculator-56',snap);assert.ok(snap.nodes.some(n=>String(n.value??'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')==='56'));check('existing stock Calculator: completely covered 7 × 8 = 56 with no setup activation');
  }else limitations.push('Existing Calculator was not fully covered; did not change window layout to manufacture a pass.');
  // The existing owned TextEdit window can be fully covered by an existing larger foreground app.
  // Do not move/raise another window; preserve the previously validated editing evidence otherwise.
  const candidates=JSON.parse(fixture.run(fixture.driver,['covers',String(edit.pid),String(edit.windowId)])).candidates;
  const coverWindow=candidates.find(w=>proof(edit,w.windowId).fullyCovered);
  if(coverWindow){
   let snap=await bg('cu_snapshot',{...edit,screenshot:false},edit,coverWindow.windowId);let area=text(snap);assert.ok(area);assert.ok(snap.window.title.startsWith('background-textedit-'));
   if(area.value)await bg('cu_select_text',{...ref(snap,area),text:area.value},edit,coverWindow.windowId);
   const lines=Array.from({length:110},(_,i)=>`Quiet row ${String(i+1).padStart(3,'0')} — stock TextEdit`).join('\n');
   await bg('cu_type_text',{...edit,...ref(snap,area),text:lines},edit,coverWindow.windowId);
   snap=await bg('cu_snapshot',{...edit,screenshot:false},edit,coverWindow.windowId);assert.equal(text(snap).value,lines);area=text(snap);
   await bg('cu_select_text',{...ref(snap,area),text:'Quiet row 001'},edit,coverWindow.windowId);
   await bg('cu_type_text',{...edit,...ref(snap,area),text:'静默后台 中文 🧪'},edit,coverWindow.windowId);
   snap=await bg('cu_snapshot',edit,edit,coverWindow.windowId);save('textedit-inserted',snap);assert.ok(text(snap).value.startsWith('静默后台 中文 🧪'));
   check('existing stock TextEdit: verified Unicode replacement, no activation/layout changes');
   const scrollBefore=snap.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width).value;
   await bg('cu_scroll',{...edit,x:250,y:300,deltaY:-400},edit,coverWindow.windowId);
   snap=await bg('cu_snapshot',edit,edit,coverWindow.windowId);save('textedit-scrolled',snap);assert.ok(snap.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width).value>scrollBefore);
   check('existing stock TextEdit: real background scrolling under existing foreground cover');
  }
  else limitations.push('No existing allowed window fully covered TextEdit; its prior real-app text/scroll evidence retained without altering user layout.');
 }
 await new Promise(r=>setTimeout(r,250));const samples=fixture.read('cover','samples').filter(s=>s.t+fixture.apps.cover.epoch>=start);const activations=fixture.read('cover','activations');
 assert.ok(samples.every(s=>s.frontPid!==t.pid&&s.frontPid!==fixture.apps.cover.pid));assert.ok(activations.every(a=>a.pid!==t.pid&&a.pid!==fixture.apps.cover.pid));check('continuous observer: neither test app ever became foreground');
 focusTrace.close();await new Promise(resolve=>focusTrace.child.exitCode!==null?resolve():focusTrace.child.once('exit',resolve));const inputFocus=focusTrace.read();
 assert.ok(inputFocus.samples.length>0&&inputFocus.samples.every(s=>s.keyboardFocusResolved&&s.keyboardPID!==t.pid&&s.keyboardPID!==fixture.apps.cover.pid));check('actual registry keyboard focus never observed in either fixture during setup and actions');
 const report={date:new Date().toISOString(),status:'passed',version:status.bridgeVersion,statusMetadata:status,checks,limitations,beforeLaunch,after:proof(t,cover),sampleCount:samples.length,foregroundPids:[...new Set(samples.map(s=>s.frontPid))],pointerDistinctPositions:new Set(samples.map(s=>s.x+','+s.y)).size,nativePointerDistinctPositions:new Set(samples.map(s=>s.nativeX+','+s.nativeY)).size,globalInputGenerated:false,activationCalls:false,targets:{fixture:t,cover:fixture.apps.cover.windowId},operations,
 inputFocusObservation:{sampleCount:inputFocus.sampleCount,maxSampleGap:inputFocus.maxSampleGap,keyboardPIDs:[...new Set(inputFocus.samples.map(s=>s.keyboardPID))],allResolved:true},
 scope:'AX text/button/selection and raw scrolling; does not establish universal raw text/key/click/drag fidelity or foreground text integrity.'};save('report',report);console.log('REPORT',path.join(directory,'report.json'));
}catch(e){save('failure',{error:e.message,checks,limitations,operations});console.error('EVIDENCE',directory);throw e}
finally{focusTrace.close();await client.close();fixture.close()}
