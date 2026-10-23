// Original mode: stdin-driven observation only; legitimate cua_repl sends input.
// Independent mode: all input uses the public js interface. Only owned windows.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {startBackgroundFixture} from './background-fixture.mjs';
import {connectRepl} from './repl-client.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),independent=process.argv.includes('--independent');
const flavors=process.argv.includes('--webkit-only')?['webkit']:process.argv.includes('--appkit-only')?['appkit']:['appkit','webkit'];
const distanceMode=process.argv.includes('--legacy')?'legacy':'calibrated';
const directory=root+`artifacts/scroll-${independent?'independent':'original'}-${Date.now()}`;mkdirSync(directory,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms)),children=[],targets={},rows=[];
let cover,repl,report={status:'preparing',directory,mode:independent?'independent':'original',distanceMode};
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim()};
const read=flavor=>JSON.parse(readFileSync(directory+'/'+flavor+'-state.json','utf8'));
const save=()=>writeFileSync(directory+'/report.json',JSON.stringify({...report,rows},null,2));
let seq=0;
async function setup(flavor,size){
 const [width,height]=size;const n=++seq;
 writeFileSync(directory+'/'+flavor+'-command.json',JSON.stringify({seq:n,width,height,x:2000,y:2000}));
 for(let i=0;i<100;i++){const s=read(flavor);if(s.seq===n&&s.offset.x===2000&&s.offset.y===2000){await pause(200);return read(flavor)}await pause(30)}throw Error('Owned fixture setup deadline');
}
function proof(flavor){const t=targets[flavor];return JSON.parse(cover.run(cover.driver,['occlusion',String(t.pid),String(t.windowId),String(cover.apps.cover.windowId)]))}
try{
 // Reuse the existing owned opaque cover, never activate it.
 cover=await startBackgroundFixture(directory,{background:true,allSpaces:true});
 for(const flavor of flavors){
  const bundle=`io.local.computeruse.scroll-${flavor}`,app=root+`.build/Scroll Calibration ${flavor}.app`,exe=app+'/Contents/MacOS/fixture';
  assert.ok(!run('/bin/ps',['-axo','comm=']).split('\n').includes(exe),'Earlier calibration fixture still running; refusing executable replacement');
  mkdirSync(app+'/Contents/MacOS',{recursive:true});
  writeFileSync(app+'/Contents/Info.plist',`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string><key>CFBundleName</key><string>Scroll Calibration ${flavor}</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleVersion</key><string>1</string></dict></plist>`);
  run('xcrun',['swiftc','-parse-as-library','-swift-version','5','-O','-framework','WebKit',root+'native/ScrollCalibrationFixture.swift','-o',exe]);run('/usr/bin/codesign',['--force','--sign','-',app]);
  const child=spawn(exe,[flavor,directory],{stdio:['ignore','ignore','pipe']});children.push(child);child.stderr.on('data',d=>process.stderr.write(d));
  for(let i=0;i<150;i++){if(existsSync(directory+'/'+flavor+'-state.json')&&read(flavor).ready)break;await pause(40)}
  targets[flavor]={...read(flavor),bundle};assert.ok(targets[flavor].ready);assert.equal(proof(flavor).fullyCovered,true);
 }
 if(independent)repl=await connectRepl({...process.env,CU_ENABLE_FOREGROUND:'0',CU_ALLOWED_BUNDLE_IDS:'io.local.computeruse.scroll-appkit,io.local.computeruse.scroll-webkit'});
 report={...report,status:'ready',targets};save();console.log('CALIBRATION_READY',JSON.stringify({directory,targets}));
 let pending;
 async function prepare(command){
  assert.ok(['appkit','webkit'].includes(command.flavor));assert.ok([[420,360],[900,700]].some(s=>s[0]===command.size?.[0]&&s[1]===command.size?.[1]));
  const before=await setup(command.flavor,command.size);assert.equal(proof(command.flavor).fullyCovered,true);
  pending={flavor:command.flavor,size:command.size,before};
  if(independent){const t=targets[command.flavor];await repl.evaluate(`(async()=>{globalThis.scrollApp=await cua.getApp({pid:${t.pid},windowId:${t.windowId}},{coordinateMode:'original'});return true})()`)}
  console.log('PREPARED',JSON.stringify({flavor:command.flavor,size:command.size,offset:before.offset,frame:before.frame}));
 }
 async function checkpoint(command){
  assert.ok(pending,'prepare first');assert.ok(['up','down','left','right'].includes(command.direction));assert.ok(Number.isFinite(command.pages)&&command.pages>0&&command.pages<=3);assert.ok(Number.isInteger(command.count)&&command.count>=1&&command.count<=3);
  await pause(300);const after=read(pending.flavor),p=proof(pending.flavor);const isolated=p.fullyCovered===true&&p.frontPid!==after.pid&&!after.active&&!after.key;
  if(independent){
   const vertical=['up','down'].includes(command.direction),factor=vertical&&distanceMode==='calibrated'?1:0.8,dimension=vertical?pending.before.frame.height:pending.before.frame.width;
   const expected=Math.round(dimension*factor*command.pages)*command.count*(['down','right'].includes(command.direction)?1:-1);
   assert.equal(after.offset[vertical?'y':'x']-pending.before.offset[vertical?'y':'x'],expected,'Recipient offset must equal requested distance, including repeats');
  }
  rows.push({...pending,direction:command.direction,pages:command.pages,count:command.count,after,isolated,toolError:command.error??null,delta:{x:after.offset.x-pending.before.offset.x,y:after.offset.y-pending.before.offset.y},proof:p});save();console.log('MEASURED',JSON.stringify({flavor:pending.flavor,size:pending.size,direction:command.direction,pages:command.pages,count:command.count,delta:rows.at(-1).delta,isolated}));pending={...pending,before:after};
 }
 if(independent){
  for(const flavor of flavors)for(const size of [[420,360],[900,700]]){
   await prepare({flavor,size});
   for(const [direction,pages,count] of [['down',0.6,1],['down',0.6,3],['up',0.3,1],['right',0.6,1],['left',0.3,1]]){
    for(let i=0;i<count;i++){
     let previous,stable=0;for(let j=0;j<100&&stable<4;j++){const p=proof(flavor),f=JSON.stringify(p.targetFrame);stable=p.fullyCovered&&f===previous?stable+1:0;previous=f;await pause(150)}assert.ok(stable>=4,'Owned window geometry must settle before input');
     await repl.evaluate(`(async()=>{let c=await scrollApp.getCoordinateInfo({emit:false});return scrollApp.scroll([100*c.scaleX,100*c.scaleY],${JSON.stringify(direction)},${pages},{distanceMode:'${distanceMode}'})})()`);
    }
    await checkpoint({direction,pages,count});
   }
  }
 }else{
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity});let timedOut=false;const stop=()=>lines.close();process.once('SIGTERM',stop);process.once('SIGINT',stop);
  const deadline=setTimeout(()=>{timedOut=true;lines.close()},900000);
  try{for await(const line of lines){if(!line.trim())continue;const c=JSON.parse(line);if(c.op==='finish')break;if(c.op==='prepare')await prepare(c);else if(c.op==='checkpoint')await checkpoint(c);else throw Error('Unknown operation')}}finally{clearTimeout(deadline);lines.close();process.stdin.pause();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop)}
  if(timedOut)throw Error('Calibration controller deadline');
 }
 assert.equal(rows.length,flavors.length*10,'All apps, sizes, directions and repeat groups required');
 const sequence=[['down',0.6,1],['down',0.6,3],['up',0.3,1],['right',0.6,1],['left',0.3,1]];
 for(const flavor of flavors)for(const size of [[420,360],[900,700]])assert.deepEqual(rows.filter(r=>r.flavor===flavor&&r.size[0]===size[0]&&r.size[1]===size[1]).map(r=>[r.direction,r.pages,r.count]),sequence,'Repeated checkpoints cannot replace a missing matrix case');report={...report,status:rows.every(r=>r.isolated&&!r.toolError)?'passed':'completed-with-isolation-differences',scope:'Two disposable applications: AppKit NSScrollView custom canvas and WKWebView local HTML. No external pages or user documents. Polling and before/after occlusion checks, not a continuous focus proof.'};
 if(report.status!=='passed')process.exitCode=1;
}catch(e){report={...report,status:'failed',error:e.message};process.exitCode=1}
finally{save();await repl?.client.close();for(const c of children)c.kill('SIGTERM');cover?.close();console.log('REPORT',directory+'/report.json',report.status,report.error??'')}
