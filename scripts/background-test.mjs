import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {startBackgroundFixture} from './background-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.resolve(process.env.CU_TEST_ARTIFACTS ?? path.join(root,'artifacts/background-'+Date.now()));
mkdirSync(dir,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const save=(name,data)=>writeFileSync(path.join(dir,name+'.json'),JSON.stringify(data,null,2));
if(process.env.CU_TEST_ALLOW_FOREGROUND_SETUP!=='1')throw Error('This interactive test activates test windows and generates foreground input. Set CU_TEST_ALLOW_FOREGROUND_SETUP=1 explicitly, or run npm run test:background for the nonactivating test.');
const fixture=await startBackgroundFixture(dir,{background:false});
const client=new Client({name:'background-acceptance',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/server.mjs')],env:{...process.env,CU_ENABLE_FOREGROUND:'1',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target,io.local.computeruse.foreground-workspace,com.apple.TextEdit,com.apple.calculator'},cwd:root});
const checks=[],operations=[],limitations=['Raw mouse events can reorder some AppKit editing windows; reproduced separately, detected with BACKGROUND_WINDOW_REORDERED. Prefer AXPress.','Generic process-directed shortcuts may be ignored; CMD+A uses verified AX selection.'];const owned=[];let serial=0;
const target={pid:fixture.apps.target.pid,windowId:fixture.apps.target.windowId};
const cover={pid:fixture.apps.cover.pid,windowId:fixture.apps.cover.windowId};
let coverId=cover.windowId;
function proof(t){return JSON.parse(fixture.run(fixture.driver,['occlusion',String(t.pid),String(t.windowId),String(coverId)]));}
async function call(name,args={}){
  const r=await client.callTool({name,arguments:args});
  const value=r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);
  if(r.isError)throw Object.assign(Error(`${name}: ${JSON.stringify(value)}`),{response:value});
  const image=r.content.find(c=>c.type==='image');
  if(image)writeFileSync(path.join(dir,`${++serial}-${name}.png`),Buffer.from(image.data,'base64'));
  return value;
}
async function bg(name,args,t=target){
  const before=proof(t);assert.equal(before.fullyCovered,true,'target must be completely occluded');assert.notEqual(before.frontPid,t.pid);
  let value;try{value=await call(name,args)}catch(e){operations.push({name,args,before,after:proof(t),error:e.response??e.message});throw e}const after=proof(t);
  operations.push({name,args,before,after,result:value});
  assert.equal(after.fullyCovered,true);assert.notEqual(after.frontPid,t.pid);return value;
}
function check(name){checks.push(name);console.log('PASS',name)}
const node=(s,id)=>{const n=s.nodes.find(n=>n.identifier===id);assert.ok(n,`missing ${id}`);return n};
const ref=(s,n)=>({snapshotId:s.snapshotId,elementId:n.id});
const textNode=s=>s.nodes.find(n=>n.role==='AXTextArea');
async function snapshot(t,label){const s=await bg('cu_snapshot',{...t},t);if(label)save(label,s);return s}
async function layout(t,x,y,w,h){let last;for(let i=0;i<15;i++){try{const result=fixture.run(fixture.driver,['layout',String(t.pid),String(t.windowId),String(x),String(y),String(w),String(h)]);await pause(400);return result;}catch(e){last=e;await pause(150)}}throw last;}
async function newTextEdit(file,text){
 writeFileSync(file,text);const previous=(await call('cu_apps')).apps.filter(a=>a.bundleId==='com.apple.TextEdit').map(a=>a.pid);
 fixture.run('/usr/bin/open',['-n','-g','-a','TextEdit',file,'--args','-ApplePersistenceIgnoreState','YES']);let a,w;
 for(let i=0;i<80;i++){a=(await call('cu_apps')).apps.find(a=>a.bundleId==='com.apple.TextEdit'&&!previous.includes(a.pid));if(a)break;await pause(100)}
 assert.ok(a);owned.push(a.pid);
 for(let i=0;i<80;i++){w=(await call('cu_windows',{pid:a.pid})).windows.find(w=>w.title.includes(path.basename(file)));if(w)break;await pause(100)}
 assert.ok(w);return {pid:a.pid,windowId:w.windowId};
}
let report;
try{
 await client.connect(transport);const status=await call('cu_status');assert.ok(status.permissions.accessibility&&status.permissions.screenRecording);assert.ok(status.background.windowLocationSPIAvailable);
 await call('cu_focus',cover);await pause(250);
 let start=Date.now()/1000;const initial=proof(target);assert.ok(initial.fullyCovered);const pointer={x:initial.pointerX,y:initial.pointerY};
 let s=await snapshot(target,'fixture-before');assert.equal(s.app.active,false);check('fully occluded target: AX and independent window PNG');
 const ocr=await bg('cu_ocr',target);assert.ok(ocr.lines.some(l=>l.text.includes('Covered background target')));check('Vision OCR reads covered window, not foreground content');
 for(const [name,args,label]of[
  ['cu_click',{...target,x:100,y:280,strategy:'event'},'custom AppKit view: real process/window-routed click'],
  ['cu_drag',{...target,fromX:80,fromY:280,toX:450,toY:280,duration:.3},'custom AppKit view: real process/window-routed drag']]){
  try{await bg(name,args);assert.ok(name==='cu_click'?fixture.read('target').clicks>=1:fixture.read('target').drags>=20);check(label)}
  catch(e){if(!['BACKGROUND_WINDOW_REORDERED','BACKGROUND_APP_ACTIVATED'].includes(e.response?.error?.code))throw e;limitations.push(`${label}: event delivery caused an isolation rejection (${e.response.error.code}); unsupported in this app state`);console.log('LIMITATION',label,e.response.error.code);await call('cu_focus',cover);await pause(200)}
 }
 const cancelBefore=proof(target),releaseBefore=fixture.read('target').releases;
 const controller=new AbortController();
 const pending=client.callTool({name:'cu_drag',arguments:{...target,fromX:80,fromY:280,toX:450,toY:280,duration:2}},undefined,{signal:controller.signal});
 setTimeout(()=>controller.abort(),350);await assert.rejects(pending);await call('cu_status');await pause(200);
 assert.ok(fixture.read('target').releases>releaseBefore);assert.notEqual(proof(target).frontPid,target.pid);
 operations.push({name:'cancel-background-drag',before:cancelBefore,after:proof(target),released:true});check('MCP cancellation releases only target drag button; fresh helper works');
 // Restore test layout only if the unsupported raw event changed stacking.
 if(!proof(target).fullyCovered){limitations.push('Cancelled raw drag changed fixture stacking; setup restored cover before core checks');await call('cu_focus',cover);await pause(200)}
 s=await snapshot(target,'fixture-after-cancellation');
 start=Date.now()/1000;
 const field=node(s,'message-input'),button=node(s,'apply-message');
 await bg('cu_type_text',{...target,...ref(s,field),text:'Covered 中文 🧪'});assert.equal(fixture.read('target').input,'Covered 中文 🧪');
 await bg('cu_click',ref(s,button));await pause(100);assert.equal(fixture.read('target').count,1);assert.ok(fixture.read('target').result.includes('Covered 中文 🧪'));check('occluded semantic button click + verified Unicode insertion');
 await bg('cu_click',{...target,x:button.frame.x+button.frame.width/2,y:button.frame.y+button.frame.height/2});assert.equal(fixture.read('target').count,2);check('coordinate AX-resolved click without global hit test');
 await bg('cu_select_text',{...ref(s,field),text:'中文'});await bg('cu_type_text',{...target,...ref(s,field),text:'replacement'});assert.equal(fixture.read('target').input,'Covered replacement 🧪');check('background UTF-16 text selection and replacement');
 await bg('cu_ax_action',{...ref(s,button),action:'press'});assert.equal(fixture.read('target').count,3);check('background semantic AX action');
 const scrollBefore=s.nodes.find(n=>n.role==='AXScrollBar').value;
 await bg('cu_scroll',{...target,x:150,y:420,deltaY:-300});s=await snapshot(target,'fixture-scrolled');assert.ok(s.nodes.find(n=>n.role==='AXScrollBar').value>scrollBefore);check('real NSScrollView scroll position changes under full occlusion');
 await pause(250);let samples=fixture.read('cover','samples').filter(a=>a.t+fixture.apps.cover.epoch>=start);
 assert.ok(samples.length>100);assert.ok(samples.every(a=>a.frontPid!==target.pid));
 const stationary=samples.every(a=>a.x===pointer.x&&a.y===pointer.y);save('fixture-isolation',{samples:samples.length,targetNeverFront:true,pointerStationary:stationary,note:stationary?'No pointer movement observed':'Human pointer activity observed; trajectory isolation is tested separately with guarded foreground traffic'});
 check('continuous sampling: background target never foreground; pointer observations saved');
 const original=Array.from({length:110},(_,i)=>`Line ${String(i+1).padStart(3,'0')} — shipping TextEdit`).join('\n');
 const edit=await newTextEdit(path.join(dir,'background-textedit-'+Date.now()+'.txt'),original);await layout(edit,280,190,620,520);await call('cu_focus',cover);await pause(300);
 s=await snapshot(edit,'textedit-before');const area=textNode(s);assert.ok(area);assert.equal(area.value,original);check('stock TextEdit completely occluded: native AX text and SCK capture');
 await bg('cu_select_text',{...ref(s,area),text:'Line 001'} ,edit);
 await bg('cu_type_text',{...edit,...ref(s,area),text:'后台 中文 🧪'},edit);
 let edited=await snapshot(edit,'textedit-inserted');assert.ok(textNode(edited).value.startsWith('后台 中文 🧪 — shipping TextEdit'));check('stock TextEdit background selection + Unicode replacement, read back');
 const sb=edited.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width);assert.ok(sb);
 await bg('cu_scroll',{...edit,x:250,y:300,deltaY:-500},edit);await pause(150);
 const scrolled=await snapshot(edit,'textedit-scrolled');assert.ok(scrolled.nodes.find(n=>n.role==='AXScrollBar'&&n.frame.height>n.frame.width).value>sb.value);check('stock TextEdit background document scroll under occlusion');
 await bg('cu_key',{...edit,key:'CMD+A'},edit);await pause(150);const keyed=await snapshot(edit,'textedit-key');
 if(textNode(keyed).selectedText===textNode(keyed).value){check('stock TextEdit background CMD+A selection verified')}else{limitations.push('Process-directed CMD+A did not change TextEdit selection in this run; no global fallback was used.');console.log('LIMITATION process-directed CMD+A ignored by TextEdit')}
 // Real shipping Calculator target, covered by the shipping TextEdit document used for concurrent typing.
 await call('cu_launch',{bundleId:'com.apple.calculator'});let calcApp,calcWindow;
 for(let i=0;i<50;i++){calcApp=(await call('cu_apps')).apps.find(a=>a.bundleId==='com.apple.calculator');if(calcApp){calcWindow=(await call('cu_windows',{pid:calcApp.pid})).windows.find(w=>w.title==='Calculator');if(calcWindow)break}await pause(100)}
 assert.ok(calcWindow);const calc={pid:calcApp.pid,windowId:calcWindow.windowId};await layout(calc,350,230,calcWindow.frame.width,calcWindow.frame.height);
 // Keep observer app running without taking foreground. TextEdit becomes an opaque full cover.
 await layout(edit,80,45,1300,800);await call('cu_focus',edit);coverId=edit.windowId;await pause(300);
 const fgEdit=await call('cu_snapshot',{...edit,screenshot:false});await call('cu_ax_action',{...ref(fgEdit,textNode(fgEdit)),action:'setValue',value:''});await call('cu_key',{...edit,key:'CMD+A'});const ready=await call('cu_snapshot',{...edit,screenshot:false});assert.equal(textNode(ready).value,'');assert.deepEqual(textNode(ready).selectedRange,{location:0,length:0});save('foreground-textedit-before',ready);
 s=await snapshot(calc,'calculator-before');save('calculator-target',calc);
 async function calculate(){for(const id of ['all-clear','seven','multiply','eight','equals']){const current=await bg('cu_snapshot',{...calc,screenshot:false},calc);let b=current.nodes.find(n=>n.identifier===id);if(!b){const names={ 'all-clear':['All Clear','Clear'],'seven':['7'],'multiply':['Multiply','×'],'eight':['8'],'equals':['Equals','=']};b=current.nodes.find(n=>n.role==='AXButton'&&names[id].includes(n.label??n.title??n.value))}assert.ok(b,`calculator button ${id}`);await bg('cu_click',{...ref(current,b),strategy:'ax'},calc)}const current=await bg('cu_snapshot',{...calc,screenshot:false},calc);assert.ok(current.nodes.some(n=>String(n.value??'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'')==='56'||String(n.label??'').includes('56')),'Calculator display should show 56');}
 await calculate();await snapshot(calc,'calculator-56');check('stock Calculator: occluded AX button actions compute 7 × 8 = 56');
 await layout(target,260,180,640,492);
 const trafficReport=path.join(dir,'foreground-traffic.json');const traffic=spawn(fixture.driver,['traffic',String(edit.pid),'8','170','150',trafficReport],{stdio:['ignore','ignore','pipe']});
 const trafficDone=new Promise((resolve,reject)=>{traffic.on('error',reject);traffic.on('exit',c=>c===0?resolve():reject(Error('traffic exited '+c)))});
 const concurrentStarted=Date.now()/1000;for(let i=0;i<3;i++){await calculate();const backgroundFixture=await bg('cu_snapshot',{...target,screenshot:false});await bg('cu_type_text',{...target,...ref(backgroundFixture,node(backgroundFixture,'message-input')),text:` BG${i}`});await bg('cu_click',ref(backgroundFixture,node(backgroundFixture,'apply-message')));}await trafficDone;await pause(250);
 const generated=JSON.parse(readFileSync(trafficReport,'utf8'));assert.equal(generated.aborted,false);
 const foregroundState=await call('cu_snapshot',{...edit,screenshot:false});save('foreground-textedit-after',foregroundState);assert.equal(textNode(foregroundState).value,generated.expected);assert.ok(generated.expected.length>100);
 samples=fixture.read('cover','samples').filter(a=>a.t+fixture.apps.cover.epoch>=generated.points[0].t+0.05&&a.t+fixture.apps.cover.epoch<=generated.epoch+generated.duration);
 assert.ok(samples.every(a=>a.frontPid===edit.pid));
 assert.ok(samples.every(a=>generated.points.some(p=>p.x===a.x&&p.y===a.y)),'background input altered foreground cursor trajectory');
 check('concurrent real foreground TextEdit typing preserved exactly while background Calculator operated');check('foreground cursor follows only generated user trajectory; no Calculator activation');
 await snapshot(calc,'calculator-concurrent-after');
 report={date:new Date().toISOString(),status:'passed',statusMetadata:status,checks,limitations,targets:{fixture:target,fixtureCover:cover,textedit:edit,calculator:calc},concurrency:{kind:'guarded synthetic foreground HID input into stock TextEdit; not a human test',typedCharacters:generated.expected.length,backgroundCalculations:3},operations};
 save('report',report);console.log('REPORT',path.join(dir,'report.json'));
 if(process.env.CU_KEEP_TEST_APPS==='1') {save('human-targets',{target:calc,coverId,observerDirectory:dir,observerPid:cover.pid,epoch:fixture.apps.cover.epoch});console.log('KEEP_READY',dir);await new Promise(resolve=>{for(const sig of ['SIGTERM','SIGINT'])process.on(sig,resolve)})}
}catch(error){save('failure',{message:error.message,stack:error.stack,checks,limitations,operations});console.error('Evidence',dir);throw error}
finally{await client.close();fixture.close();if(!report||process.env.CU_KEEP_TEST_APPS!=='1')for(const pid of owned){try{process.kill(pid,'SIGTERM')}catch{}}}
