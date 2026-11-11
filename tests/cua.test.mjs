import test from 'node:test';
import assert from 'node:assert/strict';
import { createCua } from '../src/cua.mjs';

test('app binding, AX diffs and screenshot coordinate mappings fail closed on ambiguity and resize',async()=>{
  const outputs=[],calls=[];let width=400;
  const w=()=>({pid:12,windowId:20,app:'Example',bundleId:'io.test',title:'Document',frame:{x:100,y:80,width,height:300}});
  const cua=createCua({emit:x=>outputs.push(x),request:async(method,args)=>{
    calls.push({method,args});
    if(method==='apps')return {apps:[{pid:12,name:'Example',bundleId:'io.test'}]};
    if(method==='windows')return {windows:[w()]};
    const s={data:'iVBORw0KGgo=',mimeType:'image/png',width:width*2,height:600,scaleX:2,scaleY:2,frame:w().frame};
    if(method==='snapshot')return {snapshotId:'aaaaaa00-aaaa-4aaa-8aaa-aaaaaaaaaaaa',window:w(),nodes:[{id:'e0',depth:0,role:'AXButton',label:'Go',frame:{x:10,y:10,width:50,height:20}}],...(args.screenshot?{screenshot:s}:{})};
    if(method==='screenshot')return {screenshot:s};
    if(method==='hover')return {ok:true,screenshot:s};
    return {ok:true};
  }});
  cua.bootstrap();const app=await cua.getApp('io.test');
  assert.match(outputs.at(-1).text,/AX tree/);
  assert.match(await app.getAXState({emit:false}),/no changes/);
  await app.getAXStateAndScreenshot({emit:false,maxNodes:1600,maxDepth:5});
  const limited=calls.filter(c=>c.method==='snapshot').at(-1).args;
  assert.equal(limited.maxNodes,1600);
  assert.equal(limited.maxDepth,5);
  await assert.rejects(app.getAXState({maxNodes:2001}));
  await assert.rejects(app.getAXState({maxDepth:0}));
  await app.getAXState({emit:false});
  const defaults=calls.filter(c=>c.method==='snapshot').at(-1).args;
  assert.equal(defaults.maxNodes,500);
  assert.equal(defaults.maxDepth,16);
  const screenshot=await app.getScreenshot();assert.ok(Buffer.isBuffer(screenshot));assert.equal(outputs.at(-1).type,'image');
  await app.click([100,80]);assert.deepEqual(calls.find(c=>c.method==='click').args,{pid:12,windowId:20,x:50,y:40,button:'left',count:1,strategy:'auto',mode:'background'});
  await app.getScreenshot({emit:false});
  assert.deepEqual(await app.hover([100,80],{durationMs:1500,screenshot:true}),{ok:true});
  assert.deepEqual(calls.find(c=>c.method==='hover').args,{pid:12,windowId:20,x:50,y:40,mode:'foreground',durationMs:1500,screenshot:true,maxDimension:1600});
  assert.deepEqual(outputs.at(-1),{type:'image',data:'iVBORw0KGgo=',mimeType:'image/png'});
  assert.equal((await app.getCoordinateInfo({emit:false})).scaleX,2);
  await app.click(0);assert.ok(calls.filter(c=>c.method==='click').at(-1).args.snapshotId);
  await app.typeText('value',{target:0});
  assert.deepEqual(calls.find(c=>c.method==='type_text').args,{pid:12,windowId:20,text:'value',strategy:'auto',mode:'background',snapshotId:'aaaaaa00-aaaa-4aaa-8aaa-aaaaaaaaaaaa',elementId:'e0'});
  await assert.rejects(app.typeText('value',{target:99}),{code:'INVALID_ELEMENT'});
  await app.getScreenshot({emit:false});width=500;
  await assert.rejects(app.click([100,80]),{code:'STALE_GEOMETRY'});
  await assert.rejects(app.click(99),{code:'INVALID_ELEMENT'});
  await app.pressKey('A',{durationMs:10});assert.equal(calls.find(c=>c.method==='key').args.durationMs,10);
  await assert.rejects(app.paste('x',{format:'html'}),{code:'UNSUPPORTED_FORMAT'});
  await assert.rejects(cua.getApp('missing'),{code:'APP_NOT_FOUND'});
});

test('quiet bindings refresh element references and keep changes visible on explicit AX reads',async()=>{
  const outputs=[],clicks=[];
  const window={pid:12,windowId:20,bundleId:'io.test',frame:{width:400,height:300}};
  const snapshotId=()=>`00000000-0000-4000-8000-${String(clicks.length).padStart(12,'0')}`;
  const cua=createCua({emit:result=>outputs.push(result),request:async(method,args)=>{
    if(method==='apps')return {apps:[]};
    if(method==='windows')return {windows:[window]};
    if(method==='snapshot')return {snapshotId:snapshotId(),window,nodes:[{id:'e0',depth:0,label:`Clicked ${clicks.length} times`}]};
    if(method==='click')clicks.push(args.snapshotId);
    return {ok:true};
  }});
  const app=await cua.getApp('io.test',{emit:false});
  assert.ok(!outputs.some(result=>result.text?.startsWith('Window ')));
  const initial=await app.getAXState({emit:false});
  assert.match(initial,/AX tree:[\s\S]*Clicked 0 times/);
  const before=snapshotId();
  await app.click(0);
  const refreshed=snapshotId();
  await app.click(0);
  assert.deepEqual(clicks,[before,refreshed]);
  assert.ok(!outputs.some(result=>result.text?.startsWith('Window ')));
  assert.match(await app.getAXState(),/AX diff[\s\S]*Clicked 2 times/);
});

test('dialog bindings select exact windows and preserve ordinary app-name ambiguity checks', async () => {
  const main = {pid:12,windowId:20,bundleId:'io.test',title:'Document',layer:0,frame:{width:400,height:300}};
  const dialog = {...main,windowId:21,title:'Notification',layer:3};
  let windows = [dialog,main];
  const cua = createCua({emit:()=>{},request:async (method, args) => {
    if (method==='apps') return {apps:[]};
    if (method==='windows') return {windows};
    if (method==='snapshot') return {window:windows.find(w=>w.windowId===args.windowId),nodes:[]};
    assert.fail(`Unexpected request ${method}`);
  }});
  assert.deepEqual(await cua.listWindows({emit:false}),[dialog,main]);
  assert.equal((await cua.getApp('io.test')).windowId,20);
  const panel = await cua.getApp({pid:12,windowId:21});
  assert.equal(panel.windowId,21);
  windows = [dialog,main,{...main,windowId:22,title:'Attached sheet'}];
  await assert.rejects(cua.getApp('io.test'),{code:'AMBIGUOUS_APP'});
  assert.equal((await cua.getApp({pid:12,windowId:22})).windowId,22);
  windows = [main];
  await assert.rejects(panel.getAXState(),{code:'WINDOW_GONE'});
});

test('original mode preserves measured pixels through AX readbacks, refreshes after resize and fails without scale',async()=>{
  const calls=[],outputs=[];let width=400,failCapture=false;
  const w=()=>({pid:12,windowId:20,bundleId:'io.test',path:'/Example.app',frame:{x:0,y:0,width,height:300}});
  const cua=createCua({emit:v=>outputs.push(v),request:async(method,args)=>{
    calls.push({method,args});if(method==='apps')return {apps:[]};if(method==='windows')return {windows:[w()]};
    if(method==='snapshot')return {snapshotId:'aaaaaa00-aaaa-4aaa-8aaa-aaaaaaaaaaaa',window:w(),nodes:[],...(args.screenshot?(failCapture?{screenshotError:'No recording grant'}:{screenshot:{scaleX:2,scaleY:2,data:'',mimeType:'image/png'}}):{})};
    return {ok:true};
  }});
  const app=await cua.getApp('io.test',{coordinateMode:'original'});
  assert.equal(outputs.some(v=>v.type==='image'),false,'initial hidden capture must not emit an image');
  assert.deepEqual(await app.getCoordinateInfo({emit:false}),{mode:'original',unit:'screenshot pixels',origin:'window top-left',scaleX:2,scaleY:2,range:{minX:0,minY:0,maxXExclusive:800,maxYExclusive:600},axFrameUnit:'logical points'});
  await app.getAXState({emit:false});await app.click([100,80]);await app.click([100,80]);
  assert.ok(calls.filter(c=>c.method==='click').every(c=>c.args.x===50&&c.args.y===40));
  assert.equal(calls.filter(c=>c.method==='snapshot'&&c.args.screenshot).length,1);
  width=500;await assert.rejects(app.click([100,80]),{code:'STALE_GEOMETRY'});
  await app.getAXState({emit:false});assert.equal((await app.getCoordinateInfo({emit:false})).range.maxXExclusive,1000);
  await assert.rejects(app.move([1000,0]),{code:'INVALID_COORDINATE'});
  width=600;failCapture=true;await assert.rejects(app.getAXState(),{code:'COORDINATES_UNAVAILABLE'});
  await assert.rejects(app.move([10,10]),{code:'COORDINATES_UNAVAILABLE'});
  await assert.rejects(cua.getApp('io.test',{coordinateMode:'guess'}),{code:'INVALID_ARGUMENT'});
});

test('explicit reconnect verifies identity, never selects an ambiguous window and leaves old binding strict',async()=>{
  let windows=[{pid:12,windowId:20,bundleId:'io.test',path:'/Example.app',frame:{width:400,height:300}}];let clicks=0;
  const cua=createCua({emit:()=>{},request:async(method,args)=>{
    if(method==='apps')return {apps:[]};if(method==='windows')return {windows:windows.filter(w=>args.pid===undefined||args.pid===w.pid)};
    if(method==='snapshot')return {snapshotId:'aaaaaa00-aaaa-4aaa-8aaa-aaaaaaaaaaaa',window:windows.find(w=>w.pid===args.pid&&w.windowId===args.windowId),nodes:[]};
    if(method==='click')clicks++;return {ok:true};
  }});
  const old=await cua.getApp('io.test');
  windows=[{...windows[0],pid:13,windowId:21},{...windows[0],pid:13,windowId:22},{...windows[0],pid:14,windowId:23,path:'/Impostor.app'}];
  await assert.rejects(old.click([10,10]),{code:'WINDOW_GONE'});
  const preview=await old.reconnect();assert.deepEqual(preview.candidates.map(w=>w.windowId),[21,22]);
  await assert.rejects(old.reconnect({pid:14,windowId:23}),{code:'RECONNECT_TARGET_MISMATCH'});
  await assert.rejects(old.reconnect({pid:13}),{code:'INVALID_ARGUMENT'});
  assert.equal(clicks,0);
  const app=await old.reconnect({pid:13,windowId:22});assert.equal(app.pid,13);assert.equal(app.windowId,22);
  await app.click([10,10]);assert.equal(clicks,1);
  await assert.rejects(old.click([10,10]),{code:'WINDOW_GONE'});
});

test('calibrated vertical pages use window height while legacy and horizontal retain v1 distance',async()=>{
 const scrolls=[];const window={pid:12,windowId:20,app:'Test',frame:{width:900,height:700}};
 const cua=createCua({emit:()=>{},request:async(method,args)=>{
  if(method==='apps')return {apps:[]};if(method==='windows')return {windows:[window]};
  if(method==='snapshot')return {snapshotId:'aaaaaa00-aaaa-4aaa-8aaa-aaaaaaaaaaaa',window,nodes:[]};
  if(method==='scroll')scrolls.push(args);return {ok:true};
 }});const app=await cua.getApp({pid:12,windowId:20});
 assert.equal((await app.scroll([100,100],'down',0.6)).scrollDistance.deltaY,-420);
 await app.scroll([100,100],'up',0.3);await app.scroll([100,100],'down',0.6,{distanceMode:'legacy'});await app.scroll([100,100],'right',0.6);
 assert.deepEqual(scrolls.map(s=>[s.deltaX,s.deltaY]),[[0,-420],[0,210],[0,-336],[-432,0]]);
 await assert.rejects(app.scroll([100,100],'down',1,{distanceMode:'guess'}),{code:'INVALID_ARGUMENT'});
});
