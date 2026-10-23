// Public MCP acceptance: actual AppKit multiple selection, timed delivery and reset cleanup.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {startBackgroundFixture} from './background-fixture.mjs';
import {connectRepl} from './repl-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=root+`artifacts/input-options-${Date.now()}`;
mkdirSync(directory,{recursive:true});
const fixture=await startBackgroundFixture(directory,{background:true,selectionInput:true});const target=fixture.apps.target;
const repl=await connectRepl({...process.env,CU_ENABLE_FOREGROUND:'0',CU_EXPERIMENTAL_APPKIT_FOCUS:'1',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.background-target'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let report={status:'running',directory};
const proof=()=>JSON.parse(fixture.run(fixture.driver,['occlusion',String(target.pid),String(target.windowId),String(fixture.apps.cover.windowId)]));
const events=()=>fixture.read('target','events').filter(e=>e.phase==='application-queue');
async function until(fn){for(let i=0;i<150;i++){const v=fn();if(v)return v;await pause(20)}throw Error('Recipient event deadline exceeded')}
try{
 assert.equal(proof().fullyCovered,true);
 await repl.evaluate(`(async()=>{globalThis.app=await cua.getApp({pid:${target.pid},windowId:${target.windowId}},{coordinateMode:'original'});return app.getCoordinateInfo({emit:false})})()`);
 const mapping=await repl.evaluate('app.getCoordinateInfo({emit:false})');assert.equal(mapping.unit,'screenshot pixels');
 const points=fixture.read('target').selectionRowPoints.map(([x,y])=>[x*mapping.scaleX,y*mapping.scaleY]);
 await repl.evaluate(`app.click(${JSON.stringify(points[0])},{strategy:'event'})`);
 assert.deepEqual(fixture.read('target').selectedRows,[0]);
 const shifted=await repl.evaluate(`app.click(${JSON.stringify(points[2])},{key:'shift'})`);
 assert.deepEqual(fixture.read('target').selectedRows,[0,1,2]);
 const command=await repl.evaluate(`app.click(${JSON.stringify(points[1])},{key:'super',durationMs:240})`);
 assert.deepEqual(fixture.read('target').selectedRows,[0,2]);
 assert.equal(command.pointerDelivery.commandRetainedEvents,2);
 const mouse=events().filter(e=>[1,2].includes(e.type)&&(e.flags&1048576));assert.equal(mouse.length,2);assert.ok((mouse[1].t-mouse[0].t)*1000>=200);
 const before=events().length;
 const held=await repl.evaluate("app.pressKey('Shift+Right',{durationMs:260})");
 assert.equal(held.AXActionsGenerated,false);assert.equal(held.repeatEventsGenerated,0);
 const keys=events().slice(before).filter(e=>[10,11].includes(e.type));assert.equal(keys.length,2);assert.equal(keys[0].keyCode,124);assert.equal(keys[0].flags&131072,131072);assert.ok((keys[1].t-keys[0].t)*1000>=220);assert.ok((keys[1].eventTimestamp-keys[0].eventTimestamp)*1000>=220);
 const from=events().length;
 const pending=repl.client.callTool({name:'js',arguments:{code:"await app.pressKey('Escape',{durationMs:5000}); undefined"}});
 await until(()=>events().slice(from).some(e=>e.type===10&&e.keyCode===53));
 await repl.client.callTool({name:'js_reset',arguments:{}});assert.equal((await pending).isError,true);
 await until(()=>events().slice(from).some(e=>e.type===11&&e.keyCode===53));
 const released=events().slice(from).filter(e=>[10,11].includes(e.type));assert.ok(released[1].t-released[0].t<2);
 assert.equal(proof().fullyCovered,true);assert.notEqual(proof().frontPid,target.pid);
 report={...report,status:'passed',target:{pid:target.pid,windowId:target.windowId},mapping,shifted,command,held,mouseHoldMs:(mouse[1].t-mouse[0].t)*1000,keyHoldMs:(keys[1].t-keys[0].t)*1000,cancelReleaseMs:(released[1].t-released[0].t)*1000,selectedRows:fixture.read('target').selectedRows,proof:proof()};
}catch(e){report={...report,status:'failed',error:e.message,stack:e.stack};process.exitCode=1}
finally{writeFileSync(directory+'/report.json',JSON.stringify(report,null,2));writeFileSync(directory+'/calls.json',JSON.stringify(repl.calls,null,2));await repl.client.close();fixture.close();console.log('REPORT',directory+'/report.json',report.status,report.error??'')}
