import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {startBackgroundFixture} from './background-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=root+`artifacts/cursor-occlusion-${Date.now()}`;mkdirSync(directory,{recursive:true});
const fixture=await startBackgroundFixture(directory,{background:true,resizable:true});
const target=fixture.apps.target,cover=fixture.apps.cover,calls=[],checks=[],states={};
const plain=r=>r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
let client;
async function connect(mode,style){
  if(client)await client.close();
  client=new Client({name:'cursor-occlusion',version:'1'});
  const env={...process.env,CU_ENABLE_FOREGROUND:'0',CU_EXPERIMENTAL_APPKIT_FOCUS:'0',CU_AGENT_CURSOR_VISIBILITY:mode,CU_AGENT_CURSOR_STYLE:style};
  delete env.CU_ALLOWED_BUNDLE_IDS;
  await client.connect(new StdioClientTransport({command:process.execPath,args:[process.env.CU_TEST_SERVER??root+'src/server.mjs'],cwd:process.env.CU_TEST_CWD??root,env}));
  await js(`let app=await cua.getApp({pid:${target.pid},windowId:${target.windowId}}); undefined`);
}
async function js(code){const r=await client.callTool({name:'js',arguments:{code}});calls.push({code,result:r});assert.ok(!r.isError,plain(r));return r;}
async function state(){const r=await js('await cua.cursorState(); undefined');return JSON.parse(r.content.find(c=>c.type==='text'&&c.text.trimStart().startsWith('{')).text);}
const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(cover.windowId)]));
const order=()=>JSON.parse(fixture.run(fixture.driver,['cursor-order',String(target.pid),String(target.windowId),String(cover.windowId),'0']));
let report={date:new Date().toISOString(),checks,states};
try{

  const before=proof(),beforeOrder=order();assert.equal(before.fullyCovered,true);
  await connect('target','ring');
  await js('await app.click([60,260],{strategy:"event"}); await app.drag([60,260],[350,280],{duration:0.5}); await app.scroll([350,280],"down",0.2); undefined');
  const delivered=fixture.read('target');assert.ok(delivered.clicks>=2&&delivered.releases>=2&&delivered.drags>=20&&delivered.scrolls>=1);
  states.covered=await state();assert.equal(states.covered.visibilityMode,'target');assert.equal(states.covered.visible,false);assert.deepEqual(states.covered.clipRects,[]);
  assert.ok(states.covered.history.filter(p=>p.pressed&&p.activity==='drag').length>=20);
  checks.push('fully covered cursor hidden while real click, drag and scroll arrive');
  await js('await app.move([100,270]); await app.move([240,270]); undefined');
  states.hiddenMotion=await state();assert.equal(states.hiddenMotion.visible,false);
  const motion=states.hiddenMotion.history.filter(p=>p.motion===states.hiddenMotion.history.at(-1).motion);
  assert.ok(motion.length>=8);assert.ok(new Set(motion.map(p=>p.globalX)).size>=8);
  assert.ok(motion.every(p=>p.visible===false));
  checks.push('covered movement continues through intermediate positions without drawing on the foreground');
  const afterOrder=order();assert.ok(beforeOrder.cover>=0&&beforeOrder.target>beforeOrder.cover);assert.ok(afterOrder.cover>=0&&afterOrder.target>afterOrder.cover);
  checks.push('target remains behind the cover without changing foreground focus');
  await client.callTool({name:'js_reset',arguments:{}});assert.equal((await state()).visible,false);
  const after=proof();assert.equal(after.frontPid,before.frontPid);
  assert.ok(fixture.read('target','samples').every(s=>s.frontPid!==target.pid));
  report={...report,status:'passed',before,after,beforeOrder,afterOrder,delivered,scope:'Fully covered owned windows kept behind the foreground. Actual click/drag/scroll, continuous hidden movement, reset, frontmost process and target/cover order checked. Exposed and partial glyph/glow clipping is verified by the offscreen raster test; no visible-window raising is used.'};
}catch(error){report={...report,status:'failed',error:{message:error.message,stack:error.stack}};process.exitCode=1;}
finally{
  writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));writeFileSync(directory+'/calls.json',JSON.stringify(calls,null,2));
  if(client)await client.close();await fixture.closeAndWait();console.log('REPORT',directory+'/report.json',JSON.stringify({status:report.status,checks,error:report.error}));
}
