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
    if(method==='screenshot')return {screenshot:s};return {ok:true};
  }});
  cua.bootstrap();const app=await cua.getApp('io.test');
  assert.match(outputs.at(-1).text,/AX tree/);
  assert.match(await app.getAXState({emit:false}),/no changes/);
  const screenshot=await app.getScreenshot();assert.ok(Buffer.isBuffer(screenshot));assert.equal(outputs.at(-1).type,'image');
  await app.click([100,80]);assert.deepEqual(calls.find(c=>c.method==='click').args,{pid:12,windowId:20,x:50,y:40,button:'left',count:1,strategy:'auto',mode:'background'});
  await app.click(0);assert.ok(calls.filter(c=>c.method==='click').at(-1).args.snapshotId);
  await app.getScreenshot({emit:false});width=500;
  await assert.rejects(app.click([100,80]),{code:'STALE_GEOMETRY'});
  await assert.rejects(app.click(99),{code:'INVALID_ELEMENT'});
  await assert.rejects(app.pressKey('A',{durationMs:10}),{code:'UNSUPPORTED_OPTION'});
  await assert.rejects(app.paste('x',{format:'html'}),{code:'UNSUPPORTED_FORMAT'});
  await assert.rejects(cua.getApp('missing'),{code:'APP_NOT_FOUND'});
});
