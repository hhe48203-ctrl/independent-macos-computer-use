import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startBackgroundFixture } from './background-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=fileURLToPath(new URL('../artifacts/repl-desktop/',import.meta.url));mkdirSync(directory,{recursive:true});
const fixture=await startBackgroundFixture(directory,{background:true,popup:true});
const client=new Client({name:'cua-repl-desktop-test',version:'1'});const outputs=[];
const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(fixture.apps.target.pid),String(fixture.apps.target.windowId),String(fixture.apps.cover.windowId)]));
const before=proof();
async function js(code) {
  const r=await client.callTool({name:'js',arguments:{code}});outputs.push({code,result:r});
  if(r.isError)throw Error(JSON.stringify(r.content));return r;
}
const text=r=>r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
try{
  const env={...process.env,CU_AGENT_CURSOR_VISIBILITY:'always',CU_ENABLE_FOREGROUND:'0'};delete env.CU_ALLOWED_BUNDLE_IDS;
  await client.connect(new StdioClientTransport({command:process.execPath,args:[root+'src/server.mjs'],cwd:root,env}));
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['js','js_reset']);
  const bound=await js(`let app=await cua.getApp({pid:${fixture.apps.target.pid},windowId:${fixture.apps.target.windowId}})`);
  const index=label=>Number(text(bound).split('\n').find(l=>l.includes(label))?.match(/\[(\d+)\]/)?.[1]);
  const field=index('message-input'),button=index('Apply message');assert.ok(Number.isInteger(field)&&Number.isInteger(button));
  await js(`await app.performSecondaryAction(${field},'focus'); await app.typeText('REPL 桌面 verified')`);
  await js(`await app.click(${button})`);
  const state=await js('await app.getAXState({disableDiffing:true})');assert.match(text(state),/Result: REPL 桌面 verified/);
  const popupLine=text(state).split('\n').find(line=>line.includes('"identifier":"fixture-popup"'));
  const popup=JSON.parse(popupLine.slice(popupLine.indexOf('{')));
  assert.equal(popup.role,'AXPopUpButton');
  const {x,y,width,height}=popup.frame;
  const start=[x+width/2,y+height/2];
  const end=[start[0],start[1]+24];
  const rejected=await client.callTool({name:'js',arguments:{code:`await app.drag(${JSON.stringify(start)},${JSON.stringify(end)});`}});
  outputs.push({action:'drag from native popup',result:rejected});
  assert.equal(rejected.isError,true);
  assert.match(text(rejected),/BACKGROUND_POPUP_UNSUPPORTED/);
  const afterPopup=await js('await app.getAXState({disableDiffing:true})');
  assert.ok(text(afterPopup).includes(popupLine.trim()));
  assert.doesNotMatch(text(afterPopup),/"role":"AXMenu(?:Item)?"/);
  const shot=await js('await app.getScreenshot(); undefined');const image=shot.content.find(c=>c.type==='image');assert.ok(image);writeFileSync(directory+'/window.png',Buffer.from(image.data,'base64'));
  await js('await app.move([200,160]); undefined');
  const cursor=await js('await cua.cursorState(); undefined');
  const cursorState=JSON.parse(cursor.content.find(c=>c.type==='text').text);assert.equal(cursorState.visible,true);assert.equal(cursorState.ignoresMouseEvents,true);assert.equal(cursorState.canBecomeKey,false);assert.equal(cursorState.canBecomeMain,false);
  const motion=cursorState.history.filter(p=>p.motion===cursorState.history.at(-1).motion);
  assert.ok(motion.length>=8,'cross-position motion must contain intermediate frames');
  assert.ok(new Set(motion.map(p=>`${p.globalX},${p.globalY}`)).size>=8);
  assert.ok(motion.at(-1).time-motion[0].time>=0.14,'movement must be visible over time');
  for(let i=1;i<motion.length;i++)assert.ok(Math.hypot(motion[i].globalX-motion[i-1].globalX,motion[i].globalY-motion[i-1].globalY)<60,'no instantaneous jump between distant targets');
  const scale=JSON.parse(shot.content.find(c=>c.type==='text').text).scaleX;
  assert.ok(Math.abs(cursorState.relative.x-200/scale)<1);
  const at=cursorState.global;
  fixture.run('/usr/sbin/screencapture',['-x',`-R${Math.round(at.x-24)},${Math.round(at.y-24)},80,80`,directory+'/visible-cursor.png']);
  const region={x:at.x-24,y:at.y-24,width:80,height:80};
  for(const includeAgentCursor of [true,false]){
    const capture=await js(`await cua.getScreenshot({region:${JSON.stringify(region)},maxDimension:4096,includeAgentCursor:${includeAgentCursor}}); undefined`);
    writeFileSync(directory+`/display-cursor-${includeAgentCursor}.png`,Buffer.from(capture.content.find(c=>c.type==='image').data,'base64'));
  }
  const after=proof();assert.equal(before.fullyCovered,true);assert.equal(after.fullyCovered,true);assert.equal(after.frontPid,before.frontPid);
  const samples=fixture.read('cover','samples');
  assert.ok(samples.every(s=>s.frontPid!==fixture.apps.target.pid));
  await client.callTool({name:'js_reset',arguments:{}});
  const report={date:new Date().toISOString(),success:true,onlyTools:['js','js_reset'],fixture:fixture.read('target'),before,after,cursor:cursorState,screenshotBytes:Buffer.from(image.data,'base64').length,pointerStationary:after.pointerX===before.pointerX&&after.pointerY===before.pointerY,pointerNote:'A changed pointer alone is not attributed to this backend; external human motion may occur. Detailed source tracking is separate.',sampleCount:samples.length};
  writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));writeFileSync(directory+'/calls.json',JSON.stringify(outputs,null,2));console.log(JSON.stringify({...report,cursor:{...cursorState,history:cursorState.history.length}},null,2));
}catch(error){writeFileSync(directory+'/failure.json',JSON.stringify({date:new Date().toISOString(),error:error.message,stack:error.stack,before,after:proof()},null,2));writeFileSync(directory+'/failed-calls.json',JSON.stringify(outputs,null,2));throw error;}finally{await client.close();fixture.close();}
