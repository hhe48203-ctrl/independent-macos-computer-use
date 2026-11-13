import test from 'node:test';
import assert from 'node:assert/strict';
import { tools, toMcpResult } from '../src/tools.mjs';
const schema = name => tools.find(t => t.name === name).schema;
test('coordinate and element targeting reject ambiguous or missing targets', () => {
  const click = schema('cu_click');
  assert.equal(click.safeParse({ pid: 1, windowId: 2, x: 0, y: 0 }).success, true);
  assert.equal(click.safeParse({ snapshotId: '550e8400-e29b-41d4-a716-446655440000', elementId: 'e0' }).success, true);
  for (const invalid of [{}, { x: 1, y: 2 }, { pid: 1, windowId: 2, x: -1, y: 0 }, { pid: 1, windowId: 2, x: Infinity, y: 0 }, { elementId: 'e0' }, { pid: 1, windowId: 2, x: 1, y: 2, elementId: 'e0' }]) assert.equal(click.safeParse(invalid).success, false);
});
test('capture scope and AX value semantics fail closed', () => {
  for (const name of ['cu_screenshot', 'cu_ocr']) {
    assert.equal(schema(name).safeParse({ pid: 1 }).success, false);
    assert.equal(schema(name).safeParse({ windowId: 1 }).success, false);
    assert.equal(schema(name).safeParse({ pid: 1, windowId: 2, displayId: 1 }).success, false);
    assert.equal(schema(name).safeParse({ pid: 1, windowId: 2 }).success, true);
  }
  const ref = { snapshotId: '550e8400-e29b-41d4-a716-446655440000', elementId: 'e1' };
  assert.equal(schema('cu_ax_action').safeParse({ ...ref, action: 'setValue' }).success, false);
  assert.equal(schema('cu_ax_action').safeParse({ ...ref, action: 'setValue', value: '' }).success, true);
  assert.equal(schema('cu_ax_action').safeParse({ ...ref, action: 'press', value: 'oops' }).success, false);
  assert.equal(schema('cu_ax_action').parse({ ...ref, action: 'scrollToVisible' }).mode, 'background');
});
test('PNG appears once as image, metadata does not duplicate image bytes', () => {
  const r = toMcpResult({ snapshotId: 'test', screenshot: { data: 'YWJj', mimeType: 'image/png', width: 3 } });
  assert.equal(r.content[1].type, 'image');
  assert.equal(r.content[1].data, 'YWJj');
  assert.equal(JSON.stringify(r.structuredContent).includes('YWJj'), false);
});

test('background is the default; foreground is explicit and text references are paired', () => {
  const target={pid:1,windowId:2};
  for(const [name,args] of [['cu_click',{...target,x:1,y:2}],['cu_type_text',{...target,text:'中文'}],['cu_key',{...target,key:'CMD+A'}],['cu_scroll',target],['cu_drag',{...target,fromX:1,fromY:2,toX:3,toY:4}]]){
    assert.equal(schema(name).parse(args).mode,'background');
    assert.equal(schema(name).parse({...args,mode:'foreground'}).mode,'foreground');
    assert.equal(schema(name).safeParse({...args,mode:'automatic-fallback'}).success,false);
  }
  const text={...target,text:'中文',snapshotId:'550e8400-e29b-41d4-a716-446655440000',elementId:'e1'};
  assert.equal(schema('cu_type_text').safeParse(text).success,true);
  assert.equal(schema('cu_type_text').safeParse({...text,elementId:undefined}).success,false);
  assert.equal(schema('cu_type_text').safeParse({...text,mode:'foreground'}).success,false);
  assert.equal(schema('cu_type_text').safeParse({...text,replaceAll:''}).success,true);
  assert.equal(schema('cu_type_text').safeParse({...text,replaceAll:'old',strategy:'event'}).success,false);
  assert.equal(schema('cu_type_text').safeParse({...target,text:'new',replaceAll:'old'}).success,false);
});

test('background click strategies are explicit and constrained',()=>{
  const args={pid:1,windowId:2,x:1,y:2};
  assert.equal(schema('cu_click').parse(args).strategy,'auto');
  for(const strategy of ['auto','ax','event'])assert.equal(schema('cu_click').safeParse({...args,strategy}).success,true);
  assert.equal(schema('cu_click').safeParse({...args,strategy:'activate-then-restore'}).success,false);
});

test('raw Unicode strategy is explicit and cannot imply foreground or AX fallback',()=>{
  const text={pid:1,windowId:2,text:'中文🙂'};
  assert.equal(schema('cu_type_text').parse(text).strategy,'auto');
  for(const strategy of ['auto','ax','event'])assert.equal(schema('cu_type_text').safeParse({...text,strategy}).success,true);
  assert.equal(schema('cu_type_text').safeParse({...text,strategy:'event',mode:'foreground'}).success,false);
  assert.equal(schema('cu_type_text').safeParse({...text,strategy:'event-then-AX'}).success,false);
});

test('event key strategy preserves real select-all without a semantic fallback',()=>{
 const args={pid:1,windowId:2,key:'CMD+A'};
 assert.equal(schema('cu_key').parse(args).strategy,'auto');
 assert.equal(schema('cu_key').safeParse({...args,strategy:'event'}).success,true);
 assert.equal(schema('cu_key').safeParse({...args,strategy:'event',mode:'foreground'}).success,false);
 assert.equal(schema('cu_key').safeParse({...args,strategy:'appkit'}).success,true);
 assert.equal(schema('cu_key').safeParse({...args,strategy:'appkit',mode:'foreground'}).success,false);
 assert.equal(schema('cu_key').safeParse({...args,strategy:'appkit',durationMs:0}).success,false);
 assert.equal(schema('cu_key').safeParse({...args,strategy:'event-then-AX'}).success,false);
});

test('new app launch requires an explicit visible-window choice',()=>{
 const launch=tools.find(t=>t.name==='cu_launch').schema;
 assert.equal(launch.parse({bundleId:'com.apple.TextEdit'}).allowVisibleWindows,false);
 assert.equal(launch.parse({bundleId:'com.apple.TextEdit',allowVisibleWindows:true}).allowVisibleWindows,true);
 assert.equal(launch.safeParse({bundleId:'com.apple.TextEdit',allowVisibleWindows:'true'}).success,false);
});

test('scoped AppKit clicks require one plain background coordinate click',()=>{
 const click={pid:1,windowId:2,x:10,y:20,strategy:'appkit'};
 const contract=schema('cu_click');
 assert.equal(contract.safeParse(click).success,true);
 for(const options of [{mode:'foreground'},{button:'right'},{count:2},{modifiers:'shift'},{durationMs:0}]){
  assert.equal(contract.safeParse({...click,...options}).success,false);
 }
 const ref={snapshotId:'88a4ae8e-11d6-4a29-b2fa-d4785e70d238',elementId:'e1'};
 assert.equal(contract.safeParse(ref).success,true);
 assert.equal(contract.safeParse({...ref,strategy:'appkit'}).success,false);
});

test('modifier clicks and bounded key holds cannot silently become AX or foreground actions',()=>{
 const click={pid:1,windowId:2,x:10,y:20},key={pid:1,windowId:2,key:'CMD+A'};
 for(const modifiers of ['super','CMD+Shift','ctrl+alt','option+shift'])assert.equal(schema('cu_click').safeParse({...click,modifiers,durationMs:250}).success,true);
 for(const modifiers of ['', 'a','cmd+','cmd+a','capslock'])assert.equal(schema('cu_click').safeParse({...click,modifiers}).success,false);
 for(const name of ['cu_click','cu_key']){
  const args=name==='cu_click'?click:key;
  for(const durationMs of [0,0.5,200,5000])assert.equal(schema(name).safeParse({...args,durationMs}).success,true);
  for(const durationMs of [-1,Infinity,NaN,5001,'200'])assert.equal(schema(name).safeParse({...args,durationMs}).success,false);
  assert.equal(schema(name).safeParse({...args,durationMs:200,mode:'foreground'}).success,false);
 }
 assert.equal(schema('cu_click').safeParse({...click,modifiers:'shift',strategy:'ax'}).success,false);
});
