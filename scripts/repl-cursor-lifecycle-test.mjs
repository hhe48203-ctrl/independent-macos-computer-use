import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {startBackgroundFixture} from './background-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=root+`artifacts/repl-cursor-lifecycle-${Date.now()}`;mkdirSync(directory,{recursive:true});
const fixture=await startBackgroundFixture(directory,{background:true,resizable:true});
const target=fixture.apps.target,client=new Client({name:'cursor-lifecycle',version:'1'}),calls=[],checks=[];
// This historical lifecycle test exercises the explicit progress overlay under
// full cover. Default target clipping has a separate pixel/occlusion test.
const env={...process.env,CU_AGENT_CURSOR_VISIBILITY:'always',CU_ENABLE_FOREGROUND:'0',CU_EXPERIMENTAL_APPKIT_FOCUS:process.env.CU_TEST_SCOPED_FOCUS==='0'?'0':'1',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target'};
const plain=r=>r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
async function js(code){const r=await client.callTool({name:'js',arguments:{code}});calls.push({code,result:r});assert.ok(!r.isError,plain(r));return r;}
async function cursor(){const r=await js('await cua.cursorState(); undefined');return JSON.parse(r.content.find(c=>c.type==='text'&&c.text.trimStart().startsWith('{')).text);}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(fixture.apps.cover.windowId)]));
let report={date:new Date().toISOString(),target:{pid:target.pid,windowId:target.windowId},checks};
try{
  await client.connect(new StdioClientTransport({command:process.execPath,args:[root+'src/server.mjs'],cwd:root,env}));
  const initial=await js(`let app=await cua.getApp({pid:${target.pid},windowId:${target.windowId}})`);
  const padLine=plain(initial).split('\n').find(l=>l.includes('event-pad'));const pad=JSON.parse(padLine.slice(padLine.indexOf('{'))).frame;
  const a=[pad.x+40,pad.y+45],b=[pad.x+350,pad.y+75];
  const before=proof();assert.equal(before.fullyCovered,true);
  await js(`await app.click(${JSON.stringify(a)},{strategy:'event'}); undefined`);
  await js(`await app.drag(${JSON.stringify(a)},${JSON.stringify(b)},{duration:0.6}); undefined`);
  await js(`await app.scroll(${JSON.stringify(b)},'down',0.5); undefined`);
  const actual=fixture.read('target');assert.ok(actual.clicks>=2&&actual.drags>=20&&actual.releases>=2&&actual.scrolls>=1);
  const dragCursor=await cursor();const frames=dragCursor.history.filter(p=>p.pressed&&p.activity==='drag');assert.ok(frames.length>=20);assert.ok(frames.at(-1).x>frames[0].x);checks.push('real click, 60Hz drag, release and scroll delivered under cover');
  await js('await app.move([100,80]); undefined');let state=await cursor();
  fixture.run(fixture.driver,['layout',String(target.pid),String(target.windowId),'300','270','640','492']);await pause(180);state=await cursor();
  const current=proof().targetFrame;assert.equal(state.global.x,current[0]+100);assert.equal(state.global.y,current[1]+80);assert.equal(state.visible,true);checks.push('visible cursor follows actual target window movement');
  fixture.run(fixture.driver,['layout',String(target.pid),String(target.windowId),'300','270','700','530']);await pause(160);state=await cursor();assert.equal(state.visible,false);
  const stale=await client.callTool({name:'js',arguments:{code:'await app.click([100,80])'}});assert.equal(stale.isError,true);assert.match(plain(stale),/STALE_GEOMETRY/);
  await js('await app.getAXState(); await app.move([120,90]); undefined');assert.equal((await cursor()).visible,true);checks.push('resize hides cursor and stale screenshot/AX coordinates fail before input');
  const cancelled=client.callTool({name:'js',arguments:{code:'await app.drag([80,240],[550,260],{duration:2}); undefined'}});
  await pause(1100);const reset=await client.callTool({name:'js_reset',arguments:{}});assert.ok(!reset.isError);assert.equal((await cancelled).isError,true);await pause(100);
  assert.equal((await cursor()).visible,false);assert.equal(fixture.read('target').releases,fixture.read('target').clicks);checks.push('reset during real drag releases target button and removes cursor');
  await js(`let next=await cua.getApp({pid:${target.pid},windowId:${target.windowId}});await next.move([120,90]);undefined`);
  target.child.kill('SIGTERM');await pause(180);assert.equal((await cursor()).visible,false);checks.push('target exit hides overlay');
  report={...report,status:'passed',before,after:proof(),actualInput:actual,dragFrames:frames.length,finalCursor:await cursor(),scope:'One real Retina display; multi-display coordinate formulas tested separately. Human input integrity is tested separately.'};
}catch(error){report={...report,status:'failed',error:{message:error.message,stack:error.stack}};process.exitCode=1;}
finally{writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));writeFileSync(directory+'/calls.json',JSON.stringify(calls,null,2));await client.close();fixture.close();console.log('REPORT',directory+'/report.json',JSON.stringify({...report,finalCursor:report.finalCursor?.visible}));}
